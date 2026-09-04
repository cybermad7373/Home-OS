# 18 — Go-live

**Target:** product phase 1, web / PWA
**Written:** 2026-09-04
**Hosted project:** `foxzpnofcpyeouwnoqjp` — "HouseOS's Project", ap-northeast-2

[13-SETUP-RUNBOOK.md](13-SETUP-RUNBOOK.md) says how to stand the system up from
nothing. This says what is left for *this* deployment, in the order it has to
happen, with the state of each item as of the date above. It exists because the
database and the application are now at different revisions, and the order in
which that is corrected is the difference between a clean release and a broken
one.

---

## 1. Where things stand

| | State |
|---|---|
| Hosted database | **76 of 76 migrations applied.** Was at 044; 38 were pushed on 2026-09-04 |
| Hosted Edge Functions | **All eight redeployed** against the new schema, ACTIVE |
| Hosted function secrets | `APP_URL`, `SUPABASE_*`, `VAPID_*`, `LLM_KEY_ENCRYPTION_KEY` — all present |
| `app_config` rows | Present: `supabase_url`, `service_key`. Cron cannot call a function without them |
| Storage buckets | `receipts` and `chore-photos` exist, both private |
| The deployed web app | **Unknown, and almost certainly stale.** It is not built from this revision |
| Verification | 949 unit and integration, 128 browser journeys, 902 screen renders across 11 widths and both themes, 9 of 9 UAT tasks |

**The one dangerous fact.** The hosted schema moved 38 migrations on 2026-09-04.
Migration `20260903000001` changed the signatures of functions the application
calls, and migration 047 renamed the `member_status` value `pending` to
`requested`. Whatever web app is currently pointed at that project was built
against the old schema. Until step 4 below, assume it is broken.

---

## 2. Do these first — they are not optional

### 2.1 Rotate the service role key

The `service_key` row in `app_config` was read during preparation and its value
appeared in a session transcript. Treat it as disclosed.

1. Supabase dashboard → Settings → API → roll the service role key.
2. Update it in three places, or the jobs stop:

```sql
-- Supabase SQL editor, on the hosted project
insert into app_config (key, value) values
  ('supabase_url', 'https://foxzpnofcpyeouwnoqjp.supabase.co'),
  ('service_key',  '<the new key>')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

```bash
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY='<the new key>'
```

…and in the web host's environment (section 3).

3. Confirm both rows are right:

```sql
select key, length(value) as len, updated_at from app_config order by key;
```

### 2.2 Put the LLM master key somewhere permanent

It was generated during preparation and written to a file in a **session
temporary directory that will be cleaned up**:

```
…\scratchpad\backup\hosted-llm-master-key.env
```

Copy it into a password manager now. It is already set as an Edge Function
secret; it must also go into the web host's environment as
`LLM_KEY_ENCRYPTION_KEY`, **byte for byte identical**. The application seals a
household's provider key with it and the scheduled jobs open it — two different
values means the weekly digest silently stops using AI and falls back to its
deterministic branch, with no error anywhere.

Losing it loses no household data. It loses every stored provider key, and each
household has to paste theirs again.

---

## 3. The web host

The application is a Next.js 16 server, not a static export. It needs a Node
runtime; Vercel, Fly, Railway, Render or a container all work.

**Build:** `npm ci && npm run build`  ·  **Start:** `npm start`  ·  **Node 20+**

**Build from a clean `.next`.** This is not hygiene advice. An incremental
build over a stale `.next` served a proxy bundle that did not know `/legal` was
a public route, so `/legal/privacy` and `/legal/support` answered `307` to
`/signin` in production while both returned `200` in development. A store
reviewer or a prospective member would have found a privacy page that demanded
an account. `rm -rf .next` before building, and check the two public pages after
every deploy — step 3 of the smoke test exists for this.

### 3.1 Environment variables

Required. The app will not work correctly without every one of these.

| Variable | Value | If it is missing |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://foxzpnofcpyeouwnoqjp.supabase.co` | Nothing loads |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → Settings → API | Nothing loads |
| `SUPABASE_SERVICE_ROLE_KEY` | The **new** key from 2.1 | Server-side reads fail |
| `NEXT_PUBLIC_APP_URL` | `https://<your domain>` | **Every invite link points at `localhost:3000`.** This is the one that silently produces a broken product |
| `LLM_KEY_ENCRYPTION_KEY` | Identical to the Edge Function secret | Households cannot save an AI key |
| `LLM_KEY_ENCRYPTION_KEY_VERSION` | `1` | Defaults to 1; set it explicitly |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | The public half of the VAPID pair | Push cannot be subscribed to |
| `VAPID_PRIVATE_KEY` | The private half | — |
| `VAPID_SUBJECT` | `mailto:you@example.com` | — |

Leave `NEXT_PUBLIC_DEV_LOGIN_IDENTIFIER` and `NEXT_PUBLIC_DEV_LOGIN_PASSWORD`
**unset**. The quick sign-in they enable is already guarded by
`NODE_ENV !== "production"`, so this is a second lock on a door that is shut.

`LLM_API_KEY` and friends are optional and deliberately so: they are a
single-household fallback. The ordinary path is a household pasting its own key,
which is what D-06 and the LLM specification require.

### 3.2 Supabase auth settings

Dashboard → Authentication → URL Configuration:

- **Site URL:** `https://<your domain>`
- **Redirect URLs:** `https://<your domain>/auth/callback`

Sign-in silently fails to return anywhere useful if these still say localhost.

---

## 4. Release order

The order matters. Steps 1 and 2 are already done for this project; they are
listed so the sequence is complete and repeatable.

1. ~~Apply migrations~~ — done 2026-09-04, 76 of 76.
2. ~~Deploy Edge Functions~~ — done 2026-09-04, all eight.
3. **Set the web host's environment** (section 3).
4. **Deploy the web app from this revision.** Until this happens the running app
   and the database disagree about function signatures and about an enum value.
5. **Smoke test** (section 5).
6. **Then** announce it to anybody.

If steps 1–2 ever have to be redone on a fresh environment, they still come
before 4: a new schema serving an old app degrades, and an old schema serving a
new app fails outright.

---

## 5. Smoke test, on the real domain

Ten minutes, in this order. Each one exercises a layer the previous one does not.

| # | Do | Expect | Proves |
|---|---|---|---|
| 1 | Open `/signin` over HTTPS | The page renders, no console errors | Build, env, Supabase reachable |
| 2 | Sign in | Lands on `/home` with real figures | Auth, RLS, redirect URLs |
| 3 | Open `/legal/privacy` **signed out** | Renders, no redirect | Public routes and the proxy |
| 4 | Record an expense | Appears in the ledger with the amount typed | Writes, and the schema matches the app |
| 5 | Open a member invite link | Shows the household's name | `NEXT_PUBLIC_APP_URL` is right |
| 6 | Install the PWA on a phone | Installs; the icon is not cropped | Manifest and icons |
| 7 | Grant notification permission | The subscription is stored | Service worker over HTTPS |
| 8 | Send a real push | It arrives on the phone | **The last unproven hop** — see section 6 |
| 9 | Check the cron jobs the next morning | `select * from cron.job_run_details order by start_time desc limit 20;` | `app_config`, `call_edge`, functions |

Nothing in step 6 or 7 can be tested from a laptop: a service worker only
registers over HTTPS or on localhost, which is why the device test cannot happen
until there is a deployed origin.

---

## 6. Known gaps at go-live

These are true on the day you release. None of them blocks a release; all of
them should be stated rather than discovered.

- **No push has reached a real device.** The bytes are proved correct — the
  Edge Function's own test plays the receiver and decrypts them — but the last
  hop through FCM or Mozilla's push service to a handset has never happened.
  It cannot, until there is a deployed HTTPS origin. It is step 8 above.
- **There is no self-service account deletion**, and the privacy page says so.
- **There is no automatic retention limit.** Records are kept until somebody
  removes them.
- **Two placeholder boxes are still on the public pages** — the effective date
  and legal entity on `/legal/privacy`, and the support address on
  `/legal/support`. They are marked "to be completed before release" in a dashed
  box so that shipping one is obvious rather than subtle. **Fill them in.**
- **No monitoring and no backup policy has been chosen.** Supabase takes daily
  backups on paid plans; on the free tier it does not. Decide which, and decide
  where an application error goes.
- **The free tier pauses a project after seven days of inactivity.** Migration
  019 schedules a weekly heartbeat query specifically to prevent that, so a
  quiet household does not lose its app. Verify the `heartbeat` job exists.
- **Native mobile is a separate product phase** (engineering phase 17). Native
  push uses a provider adapter and a platform token lifecycle; browser Web Push
  and VAPID are not reusable as native transport.

---

## 7. Rolling back

The pre-push dumps of the hosted project are in the preparation scratchpad:
`pre-push-schema.sql` and `pre-push-data.sql`, taken immediately before the
2026-09-04 migration. **Move them somewhere permanent** — they contain real
household records, which is also why they are not in this repository.

A schema rollback is not a `db reset`: that discards data. Restore the
pre-push dumps into a *new* project and repoint the app, then investigate. Do
not attempt to reverse 38 migrations in place.

For a bad *application* release, redeploy the previous build. The schema is
forward-compatible with this revision and the one before it in everything except
the function signatures changed by `20260903000001`, which is why the app and
the database have to move together.
