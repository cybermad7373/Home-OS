# 18 — Go-live

**Target:** product phase 1, web / PWA
**Written:** 2026-09-04 · **Revised:** 2026-09-06, when six of the gaps in
section 6 stopped being gaps
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
| Hosted database | **76 of 76 migrations applied on 2026-09-04.** Three more have been written since — 090 rate limiting, 091 account erasure, 092 retention — and are applied **locally only**. The hosted project is three migrations behind this revision |
| Hosted Edge Functions | **All eight redeployed** against the new schema, ACTIVE |
| Hosted function secrets | `APP_URL`, `SUPABASE_*`, `VAPID_*`, `LLM_KEY_ENCRYPTION_KEY` — all present |
| `app_config` rows | Present: `supabase_url`, `service_key`. Cron cannot call a function without them |
| Storage buckets | `receipts` and `chore-photos` exist, both private |
| The deployed web app | **Unknown, and almost certainly stale.** It is not built from this revision |
| Verification | 1,058 unit and integration, 202 browser cases across the mobile and desktop projects, 902 screen renders across 11 widths and both themes, 9 of 9 UAT tasks |

**The one dangerous fact.** The hosted schema moved 38 migrations on 2026-09-04.
Three more were written on 2026-09-06 and have not been pushed anywhere; step 1
of the release order below is no longer struck through because of them.
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
| `APP_REVISION` | The deployed git sha | `/api/health` cannot say which build is running |
| `SUPABASE_DB_URL` | Settings → Database, on the host that runs the backup job | No backups. See [19-BACKUP.md](19-BACKUP.md) |
| `CSP_REPORT_ONLY` | Unset, or `1` for a shakedown week | Unset is enforcement, which is the intended state |
| `RATE_LIMIT_WRITES` | Unset, or a number | Sets the "everything else" ceiling only; defaults to the specified 300 per member per hour |

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

The order matters. Step 2 is done for this project and step 1 is now only
partly done; both are listed so the sequence is complete and repeatable.

1. **Apply migrations.** 76 of 76 were pushed on 2026-09-04; 090, 091 and 092
   were written on 2026-09-06 and are applied locally only. The app deployed in
   step 4 calls `consume_rate_limit` on every write, so this one is not
   optional and it comes first — the limiter fails open, but account deletion
   and the retention sweep do not exist at all without their migrations.
2. ~~Deploy Edge Functions~~ — done 2026-09-04, all eight. Nothing in 090 to 092
   changes a function, so this does not have to be repeated.
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
| 10 | `curl https://<domain>/api/health` | `{"status":"ok","database":true,...}` with a 200, and `revision` matching what you deployed | The app can reach its database, and the build is the one you pushed |
| 11 | `curl -I https://<domain>/signin` | A `content-security-policy` header carrying `'nonce-…'` and `'strict-dynamic'` | The policy is enforced rather than absent |
| 12 | Sign in, open five screens, watch the browser console | No "Refused to load/execute" messages | The policy is not refusing the product's own scripts |

Nothing in step 6 or 7 can be tested from a laptop: a service worker only
registers over HTTPS or on localhost, which is why the device test cannot happen
until there is a deployed origin.

---

## 5a. What the application now does for itself

Added on 2026-09-04 and 2026-09-06, so the deploy does not have to.

| | |
|---|---|
| **Security headers** | Set in `next.config.ts` for every route: `X-Frame-Options: DENY` (this product is mostly approvals, and an un-framed app cannot be click-jacked through one), `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera, microphone and geolocation, and two-year HSTS. The `Content-Security-Policy` moved out of this file on 2026-09-06 — it carries a per-request nonce now, so the proxy sets it |
| **Errors say nothing** | A 500 carries its code and its sentence. The raw Postgres message an unmapped database error arrives with is logged and stripped, rather than spread into the response as it used to be |
| **The error screen shows a reference** | The digest, which is what ties what a person saw to a line in your log. The message is development-only |
| **Server code is guarded** | `import "server-only"` on every module that touches the database or the LLM master key, so a client component reaching for one fails the build rather than the request |
| **Scripts run because this request minted their nonce** | A full `Content-Security-Policy`, built per request in the proxy. Added 2026-09-06, D-87 |
| **A write loop is refused** | The ceilings in section 15 of the API specification, counted in Postgres so instances share one counter. D-88 |
| **An error goes somewhere findable** | One JSON line per failure, carrying the route pattern and never the URL, with a reference that is also in the response. D-89 |
| **A person can delete their account** | `/more/account`, keeping the household's arithmetic under "Former member". D-90 |

---

## 6. Known gaps at go-live

Six of the items that were here on 2026-09-04 have been closed. What follows is
what is still true on the day you release.

### Closed on 2026-09-06

| Was | Now |
|---|---|
| No `Content-Security-Policy` beyond `frame-ancestors` | A per-request nonce with `'strict-dynamic'`, minted in the proxy. `style-src` keeps `'unsafe-inline'` deliberately — see D-87 for why that is the honest form rather than the strict one. `CSP_REPORT_ONLY=1` gives a new deploy a shakedown week |
| No application-level rate limiting, and section 15 of the API specification enforced by nothing | That table, row by row: thirty expenses an hour, sixty chore responses, twenty decisions a day, 300 for everything else. Counted in Postgres so two instances share one counter, checked in the proxy so no endpoint is missed, failing open so a slow database is not an outage. D-88. It is the floor under a limiter at the host or CDN, not a replacement for one |
| No self-service account deletion | `/more/account`. The person is erased and the ledger keeps its arithmetic under "Former member"; refused while any membership is active, because leaving a Home is that Home's decision. D-90 |
| No automatic retention limit | Weekly: read notifications after 180 days, unread after 365, dead invitations after 90, refused join requests after 365. Nothing touches an expense, chore, decision or rule, and a test asserts that. D-91 |
| No monitoring, and no decision about where an error goes | One JSON line per error on stderr, carrying the shape of a failure and never its contents, with a reference the person can quote. `/api/health` answers 200 or 503 for an uptime checker. D-89 |
| No backup policy | `npm run backup` and [19-BACKUP.md](19-BACKUP.md). The plan is the free tier, which takes none of its own. D-92 |

**Two of these need something set before they do anything.** `APP_REVISION`
should carry the deployed git sha so `/api/health` can answer "is this the build
I pushed", and the backup job needs `SUPABASE_DB_URL` in the environment of
whatever runs it. Both are in section 3.1.

### Still open

- **No push has reached a real device.** The bytes are proved correct — the
  Edge Function's own test plays the receiver and decrypts them — but the last
  hop through FCM or Mozilla's push service to a handset has never happened. It
  cannot, until there is a deployed HTTPS origin. It is step 8 of the smoke
  test, and it is now the only item on this list that needs a human with a
  phone rather than a decision.
- **Two placeholder boxes are still on the public pages** — the effective date
  and legal entity on `/legal/privacy`, and the support address on
  `/legal/support`. They are marked "to be completed before release" in a
  dashed box so that shipping one is obvious rather than subtle. Setting
  `NEXT_PUBLIC_LEGAL_ENTITY`, `NEXT_PUBLIC_LEGAL_ADDRESS` and
  `NEXT_PUBLIC_SUPPORT_EMAIL` replaces all three; nothing in this repository
  can fill them in, because inventing a company name for a legal page is
  fabricating a record (D-82).
- **Storage files are not backed up**, and [19-BACKUP.md](19-BACKUP.md) section
  5 says why that is a decision rather than an oversight: a receipt photo
  corroborates an expense whose amount, payer, date and splits are all in
  Postgres.
- **The per-Home AI caps are per instance.** Section 15's per-Home rows — rule
  parsing, food ideas, credential verification, schedule generation — are held
  in memory in `lib/infra/llm/rate.ts`, which the LLM specification settled as a
  spend guard rather than a correctness one. On a deploy of more than one
  instance a Home can spend up to that many times its cap. Single-instance is
  the assumed shape; if that changes, this is the thing to move into Postgres
  beside the per-member counters.
- **The free tier pauses a project after seven days of inactivity.** Migration
  019 schedules a weekly heartbeat query specifically to prevent that. Verify
  the `heartbeat` job exists — and, since 2026-09-06, `sweep-rate-limit` and
  `purge-expired` alongside it.
- **Native mobile is a separate product phase** (engineering phase 17). Native
  push uses a provider adapter and a platform token lifecycle; browser Web Push
  and VAPID are not reusable as native transport.

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
