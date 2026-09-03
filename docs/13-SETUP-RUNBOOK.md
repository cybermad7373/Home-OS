# 13 — Setup and Deployment Runbook

**Product:** HouseOS
**Version:** 2.0
**Date:** 2026-08-27

Zero to deployed, every command. Follow top to bottom. Total cost: ₹0.

---

## 1. Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 20 LTS or later | `node -v` |
| npm | 10 or later | `npm -v` |
| Git | any recent | `git --version` |
| Docker Desktop | latest | `docker -v` — required for the local Supabase stack |
| Supabase CLI | latest | `npm i -g supabase && supabase -v` |

Accounts needed, all free: GitHub, Supabase, Vercel, and an LLM provider key (optional — Google AI Studio has a free tier). Push needs no account at all: Web Push is a browser standard and the VAPID pair is generated locally.

---

## 2. Project initialisation

```bash
npx create-next-app@latest houseos \
  --typescript --tailwind --app --src-dir=false \
  --import-alias "@/*" --eslint
cd houseos

# core
npm i @supabase/supabase-js @supabase/ssr zod date-fns

# UI
npx shadcn@latest init
npx shadcn@latest add button card dialog sheet input label select \
  tabs badge avatar toast skeleton form calendar popover switch \
  slider progress separator dropdown-menu alert

# push and PWA
# Web Push is implemented with Web Crypto in the Edge Function shared code;
# the current app has no next-pwa/web-push runtime dependency.
npm i -D vitest @vitest/coverage-v8 fast-check @playwright/test \
        @axe-core/playwright supabase
```

Create the directory tree from section 6 of [03-ARCHITECTURE.md](03-ARCHITECTURE.md):

```bash
mkdir -p lib/{domain/{fairness,scheduling,governance,rules,expenses,settlement,food,calendar,analytics},data,infra/llm,types,utils}
mkdir -p supabase/{migrations,functions}
mkdir -p tests/{unit,integration,e2e}
mkdir -p docs
```

---

## 3. Supabase — local first

```bash
supabase init
supabase start
```

`supabase start` prints the local API URL, anon key and service-role key. Keep that output.

### 3.1 Migrations

Create them in this order. The order matters — enums before tables, tables before policies.

```bash
supabase migration new 001_enums
supabase migration new 002_identity_house_rooms
supabase migration new 003_availability_guests
supabase migration new 004_chores_scheduling
supabase migration new 005_effort
supabase migration new 006_expenses
supabase migration new 007_settlement
supabase migration new 008_notifications_ai_audit
supabase migration new 009_indexes
supabase migration new 010_triggers
supabase migration new 011_rls_policies
supabase migration new 012_views
supabase migration new 013_cron_jobs

# version 2.0
supabase migration new 014_roles_and_membership
supabase migration new 015_invitations_join_requests
supabase migration new 016_governance
supabase migration new 017_rules
supabase migration new 018_absence_and_quorum
supabase migration new 019_adjustments
supabase migration new 020_food
supabase migration new 021_v2_indexes_policies_views
supabase migration new 022_v2_cron_jobs
```

Paste the corresponding SQL from [04-DATABASE.md](04-DATABASE.md) into each: section 3 into 001, section 4.1 into 002, and so on through section 8 into 012.

**Order matters more than usual in 014 to 020.** `decisions` is referenced by
`house_members`, `absence_requests`, `home_rule_versions` and
`balance_adjustments`, so those foreign keys are added *after* 016 rather than
inside the tables that own them — the `alter table … add constraint` statements
are written out in section 4.7 of the database document for exactly that reason.

**014 contains the one migration in the set that can break things quietly.**
`member_status` renames `'pending'` to `'requested'`. The rename preserves every
row and is invisible to `select`, so anything comparing the string literal keeps
compiling and stops matching. Before writing it:

```bash
grep -rn "'pending'" supabase/migrations lib/ app/ tests/
```

Restate every policy, function and check constraint the grep finds, in the same
migration.

Apply and verify:

```bash
supabase db reset          # applies every migration to a clean database
supabase db lint           # catches missing policies and unindexed foreign keys
```

### 3.2 Cron jobs — migration 013

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- helper: call an edge function with the service role key
create or replace function call_edge(fn text, body jsonb default '{}') returns void as $$
  select net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/' || fn,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.service_key')),
    body    := body
  );
$$ language sql security definer;

-- times are UTC; these correspond to Asia/Kolkata as noted
select cron.schedule('generate-weekly',  '35 14 * * 0', $$select call_edge('generate-weekly-schedule')$$);  -- Sun 20:05 IST
select cron.schedule('dispatch-reminders','0 * * * *',   $$select call_edge('dispatch-reminders')$$);
select cron.schedule('auto-confirm',     '*/30 * * * *', $$select call_edge('auto-confirm-chores')$$);
select cron.schedule('mark-missed',      '25 18 * * *',  $$select call_edge('mark-missed-chores')$$);       -- 23:55 IST
select cron.schedule('post-recurring',   '30 0 * * *',   $$select call_edge('post-recurring-expenses')$$);  -- 06:00 IST
select cron.schedule('weekly-digest',    '35 15 * * 0',  $$select call_edge('weekly-digest')$$);            -- 21:05 IST
select cron.schedule('budget-alerts',    '30 14 * * *',  $$select call_edge('budget-alerts')$$);            -- 20:00 IST
select cron.schedule('prune-media',      '0 3 1 * *',    $$select call_edge('prune-old-media')$$);
select cron.schedule('heartbeat',        '0 3 * * 1',    $$select 1$$);

-- version 2.0 — migration 022
select cron.schedule('expire-decisions', '5 * * * *',    $$select call_edge('expire-decisions')$$);
select cron.schedule('remind-decisions', '30 13 * * *',  $$select call_edge('remind-decisions')$$);      -- 19:00 IST
select cron.schedule('complete-removals','30 1 * * *',   $$select call_edge('complete-pending-removals')$$); -- 07:00 IST
select cron.schedule('food-suggestions', '30 10 * * *',  $$select call_edge('refresh-food-suggestions')$$);  -- 16:00 IST
```

The first three are governance infrastructure rather than conveniences. A
decision that can only lapse while somebody has a screen open does not lapse, and
a removal that only completes when somebody remembers to check does not complete.

**A house in a different timezone requires these cron expressions to be recalculated.** They are hard-coded to IST offsets, which is the one place the single-timezone assumption from the TRD is baked into infrastructure rather than code.

### 3.3 Storage buckets

In the Supabase dashboard, or via SQL:

```sql
insert into storage.buckets (id, name, public) values
  ('receipts', 'receipts', false),
  ('chore-photos', 'chore-photos', false);

-- object paths are always {house_id}/{filename}
create policy "house members read receipts" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and is_house_member((storage.foldername(name))[1]::uuid)
  );

create policy "house members write receipts" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and is_house_member((storage.foldername(name))[1]::uuid)
  );
```

Repeat both policies for `chore-photos`.

### 3.4 Generated types

```bash
npm run gen:types
```

This regenerates `lib/types/supabase.ts`; handwritten aliases remain in
`lib/types/database.ts`. Re-run after every migration. A stale generated type
file is a common source of confusing build errors.

---

## 4. Environment variables

`.env.local` for development:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start>

NEXT_PUBLIC_VAPID_PUBLIC_KEY=<generated below>
VAPID_PRIVATE_KEY=<generated below>
VAPID_SUBJECT=mailto:you@example.com

LLM_KEY_ENCRYPTION_KEY=<generated below>

LLM_PROVIDER=gemini
LLM_API_KEY=<optional fallback>
LLM_MODEL=gemini-flash-latest

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Commit a `.env.example` with the same keys and empty values. Never commit `.env.local`.

### 4.1 VAPID keys

```bash
npm run gen:vapid
```

Generate once. Regenerating invalidates every existing push subscription in the wild — every device in every house would have to be re-registered — so treat these as permanent.

The pair serves browser and PWA devices in product phase 1. Native mobile push
credentials are separate product-phase-2 secrets managed by the selected
Android/iOS push providers; browser VAPID keys must not be reused as native
provider credentials.

### 4.2 LLM key sealing key

```bash
npm run gen:llmkey
```

32 bytes of base64. It encrypts the provider keys that houses enter for themselves, so it must be set both here and as a function secret, and it must be the same value in both places. Losing it does not lose data — every house simply re-enters its provider key — but rotating it carelessly does: add the new value as version 2 rather than replacing version 1, and let the rows re-seal.

Without it, AI features still work through the environment fallback below, and any attempt to save a house key fails with a plain message rather than storing plaintext.

### 4.3 LLM provider key (optional)

**The ordinary path is not this file.** A house admin picks a provider and pastes a key during house creation, or later at `/house/settings/ai`, and it is stored encrypted against that house. Any of Gemini, Groq, OpenRouter, Hugging Face, Cerebras, Mistral, OpenAI, Anthropic or a custom OpenAI-compatible URL will do; the first six have a free tier that covers one house many times over. See [10-LLM-SPEC.md](10-LLM-SPEC.md) sections 2 and 3.

`LLM_PROVIDER`, `LLM_API_KEY` and `LLM_MODEL` are the fallback, for a deployment that serves exactly one house and for development. A house with its own key never touches them.

Leaving everything unset is fully supported: three features fall back to deterministic paths and nothing errors.

---

## 5. Edge functions

```bash
supabase functions new generate-weekly-schedule
supabase functions new dispatch-reminders
supabase functions new auto-confirm-chores
supabase functions new mark-missed-chores
supabase functions new post-recurring-expenses
supabase functions new weekly-digest
supabase functions new budget-alerts
supabase functions new prune-old-media

# version 2.0
supabase functions new expire-decisions
supabase functions new remind-decisions
supabase functions new complete-pending-removals
supabase functions new refresh-food-suggestions
```

Each follows this shape:

```ts
// supabase/functions/generate-weekly-schedule/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!   // service role: bypasses RLS by design
  );

  const { data: houses } = await supabase.from('houses').select('id, timezone');

  for (const house of houses ?? []) {
    try {
      await generateWeek(supabase, house);       // one transaction per house
    } catch (e) {
      console.error(`house ${house.id}:`, e);    // one failure never blocks another house
    }
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

Two rules for every job: **one transaction per house**, so a failure isolates; and **idempotent**, so a repeated run is harmless.

Test locally:

```bash
supabase functions serve generate-weekly-schedule
curl -X POST http://127.0.0.1:54321/functions/v1/generate-weekly-schedule \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Deploy:

```bash
supabase functions deploy --no-verify-jwt
```

---

## 6. Service worker and PWA

`public/sw.js` — push handling, offline cache, and the notification actions from section 4 of [11-NOTIFICATIONS-SPEC.md](11-NOTIFICATIONS-SPEC.md).

`app/manifest.ts` — the generated web manifest from section 9 of [08-UI-UX-SPEC.md](08-UI-UX-SPEC.md).

Icons required in `public/`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `badge-72.png`. The maskable icon needs its content inside the safe zone (80 percent of the canvas) or Android will crop it badly.

Register in the root layout:

```tsx
useEffect(() => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
}, []);
```

---

## 7. Production Supabase

1. supabase.com → New project. Choose the region nearest the house (Mumbai `ap-south-1` for India).
2. Save the database password somewhere permanent — it cannot be recovered.
3. Link and push:

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy
```

4. Set the function secrets:

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com \
  LLM_KEY_ENCRYPTION_KEY=...   LLM_PROVIDER=gemini LLM_API_KEY=... LLM_MODEL=gemini-flash-latest \
  LLM_BASE_URL=...             APP_URL=https://your-app.vercel.app
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into every function
by the platform and must not be set here. Note the name: the Edge Functions read
`VAPID_PUBLIC_KEY`, **without** the `NEXT_PUBLIC_` prefix the browser bundle uses
— nothing in a Deno function is bundled for a browser. `LLM_BASE_URL` is needed
only for the `custom` provider id. The `LLM_*` secrets are the **deployment
fallback** for the scheduled jobs; a Home that has set its own key never uses
them (D-35, D-38; `docs/10-LLM-SPEC.md` §3).

5. Insert the two `app_config` rows the cron helper reads. Run this in the SQL
   editor, as the project owner:

```sql
insert into app_config (key, value) values
  ('supabase_url', 'https://<ref>.supabase.co'),
  ('service_key',  '<service role key>')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

   **Do not use `alter database postgres set app.supabase_url = ...`.** That
   needs superuser, which the `postgres` role on hosted Supabase does not have.
   The statement fails, and the failure only surfaces later, when `call_edge`
   raises "unrecognized configuration parameter" at run time and a scheduled job
   silently stops firing. Migration 021 exists precisely to replace that
   approach with the table above; `app_config` has RLS on and no policies, so
   these rows are readable only by security-definer functions and the service
   role.

   Verify it before moving on:

```sql
select key, left(value, 12) || '…' as value from app_config order by key;
select call_edge('dispatch-notifications');   -- returns void; check the function logs
```

6. Authentication → URL Configuration: set the site URL and add the Vercel preview pattern to redirect URLs.
7. Authentication → Providers: enable Google, pasting the client ID and secret from Google Cloud Console with the Supabase callback URL registered there.

---

## 8. Vercel

```bash
npm i -g vercel
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# repeat for every variable in section 4, for production and preview
vercel --prod
```

Or connect the GitHub repository in the Vercel dashboard and let pushes to `main` deploy. Set the same environment variables under Settings → Environment Variables.

**Do not add Vercel Cron jobs.** All scheduling lives in `pg_cron`, per the TRD.

### 8.1 Mobile release operations (product phase 2)

Do not create mobile signing keys or native push-provider credentials during
web setup. Before native release, document the selected client stack and
configure Android application id/signing and Play Console testing, iOS bundle
signing and TestFlight, privacy/support URLs, data-safety and account/data
deletion flows, native push token rotation, and verified app/universal links.
Keep signing and provider credentials in platform secret stores or CI, never in
this repository or `.env.local`. Browser VAPID keys are not native push keys.

---

## 9. Post-deploy verification

Work through this list on the live deployment. Every item, in order.

| # | Check | Expected |
|---|-------|----------|
| 1 | Open the production URL | Sign-in screen renders, both themes correct |
| 2 | Sign up, create a Home | Home created, invite link shown |
| 3 | `select * from houses` as another user's token | Zero rows — RLS is live |
| 4 | Complete onboarding | Availability saved, derived windows shown correctly |
| 5 | Enable push, then trigger a test notification | Arrives on the device |
| 6 | Install to home screen | Icon correct, opens standalone |
| 7 | Add an expense | Splits computed, sum exact, visible to a second member |
| 8 | Create templates, force-generate a week | Assignments created, no constraint violation |
| 9 | Mark done, confirm from a second account | Points post exactly once |
| 10 | `select * from cron.job` | Thirteen jobs scheduled |
| 11 | Invoke each edge function manually | All return `ok: true` |
| 12 | Close a test period | Proposes a decision; nothing is settled until the acknowledgements are in; then nets to zero and UPI links open a payment app |
| 13 | Lighthouse on `/today` | Performance ≥ 90, accessibility ≥ 95 |
| 14 | Unset `LLM_API_KEY` in preview, with no Home key stored, and re-run the suite | Everything green |
| 15 | Create a Home, pick a provider, paste a key, press Verify | Round trip reported; `house_llm_config` shows `active` and the last four characters only |
| 16 | Open the invite link in a private window, sign up, request to join | The waiting screen appears and shows nothing about the Home |
| 17 | As that requested person's token, `select * from expenses` and `select * from decisions` | Zero rows from both |
| 18 | As the Admin, `select apply_decision('<a waiting decision>')` **with the service-role key** | Refused |
| 19 | Propose a member removal and approve it with only the Admin's response | Stays `waiting` |
| 20 | Record a meal with only a name and today's date | Saves; the Food screen shows it |
| 21 | Open Food with fewer than five meals recorded | The cold-start message, not a ranking |
| 22 | Switch a Home's `food_ideas` capability off | The AI half disappears; no error; the library half renders |

---

## 10. Day-one operations

### Setting the Home up

1. Admin creates the Home, chooses its type, and adds the rooms first — a member who joins before rooms exist has a confusing onboarding.
2. **Promote a Co-Admin before inviting anybody.** A Home with two leads is one where the governance defaults work as written; a Home with one leans every Critical decision harder on its members. This is the single most consequential five seconds of setup.
3. Review the nine default chore templates against reality. The default workload is 787 points a week; adjust the points before anyone sees a schedule, because changing them later reopens the argument the app exists to end.
4. **Set the penalty rate to ₹0.** Shadow mode for the first month.
5. Share the invite link in the group chat with one line of explanation.
6. Accept each request as it arrives and assign the person a room.
7. Wait until everyone has set their presence before generating the first week. A bad first schedule is very hard to recover from socially.
8. Generate the first week manually rather than waiting for Sunday.
9. Leave the rules screen empty for a fortnight. Rules the Home writes after living with the app are rules it means; rules written on day one are guesses.

### Weekly

Nothing. The system generates, reminds, confirms and digests on its own.

Once a week, glance at Approvals. A queue that is growing means the levels are
set too high for this Home, and the fix is the governance settings rather than
nagging people.

### Monthly

1. Check that no approvals are outstanding.
2. Propose the close from the Money screen.
3. Review the penalties step — in month one, note aloud what people *would* have owed.
4. **Wait for the Co-Admin and the members to acknowledge.** This is the part that is new, and it is the part that makes the close the Home's rather than the Admin's. If an acknowledgement does not come, ask the person; do not look for a way around it.
5. Members pay and mark; receivers confirm.
6. After month one, propose a penalty rate the Home has agreed on. It is a Critical decision now, which is the point — the number that takes money from people is one they said yes to.

### When something needs correcting

Do not edit history. A wrong balance is fixed with a **balance adjustment**,
which both affected people approve and which leaves the original expenses exactly
as they were. A closed month is reopened by a decision, with a reason, or the
amount is carried forward as a tagged adjustment — which needs no decision and is
usually the better answer.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "relation does not exist" after a migration | Types not regenerated | `supabase gen types typescript --local > lib/types/database.ts` |
| Every query returns zero rows | RLS with no matching policy, or membership not `active` | Check `house_members.status`; check the policy exists for that table |
| Push permission granted but nothing arrives | VAPID mismatch between client and server | Confirm `NEXT_PUBLIC_VAPID_PUBLIC_KEY` matches the private key on the server |
| Cron jobs never run | `app.supabase_url` or `app.service_key` unset | Run the `alter database` statements in section 7.5 |
| Schedule generated with everything unassigned | No availability rows, or every constraint filtering everyone out | Check `member_availability` has seven rows per member |
| Splits fail with "split total does not equal" | Rounding remainder not distributed | The remainder loop in the split calculator is wrong — see T-SPL-P1 |
| Close blocked by "balances don't net to zero" | A defect in penalty distribution | Do not force it. Check `Σ penalty_credit = Σ penalty_owed` |
| Supabase project paused | More than 7 days idle | The heartbeat job prevents it; unpause in the dashboard and verify cron is running |
| LLM always rejected | Prompt drift or a model change | Read `llm_runs.validation_errors` for the specific constraint; see section 12 of [10-LLM-SPEC.md](10-LLM-SPEC.md) |
| Every query returns zero rows for one person, and they can sign in | Their membership is `requested` or `inactive`, not `active` | Check `house_members.status`. This is the rule working, not a bug. |
| A decision never resolves | A mandatory participant has not responded, or the Home has no Co-Admin and the requirement was computed with one | Open the decision; the participant checklist names who is outstanding. Check `governance_policy.critical_requires_coadmin`. |
| A decision is `approved` and nothing happened | Application failed after approval | Read `decisions.apply_error`. The commonest cause is the world moving: the last Admin being the subject of a removal, or balances no longer netting. |
| The close proposes but never closes | Acknowledgements outstanding | This is the feature. `GET /api/decisions?state=pending` names who is outstanding; there is no view for it. |
| A chore stays `done_pending` with confirmations on it | The quorum needs a lead and none has confirmed | Check `confirmations_required` and `requires_lead_confirmer` on the row. Auto-confirm will still resolve it at the window. |
| A rule was submitted and is not in force | Its decision is still waiting | Rules activate through governance, never on submission. |
| Food suggestions are empty | Fewer than five recorded meals, or every candidate scores negative | The cold-start message says which. Neither is an error. |
| The AI half of the suggestion card never appears | No key, the capability is off, or every response failed validation | Check `house_llm_credentials.capabilities`, then `llm_runs` for `food_ideas` rows and their `validation_errors`. |
| Duplicate foods multiplying | People are declining the did-you-mean panel | A lead can merge them; History keeps both names. |
| Free-tier storage filling | Photos not compressed client-side | Verify the 1280 px compression before upload; run `prune-old-media` |

---

## 12. Backup

The free tier includes no automated backups. This runs weekly on any machine that is switched on:

```bash
supabase db dump --db-url "$PROD_DB_URL" -f "backup-$(date +%F).sql"
```

Keep four weeks. The data set is small — a year of a single house is a few tens of megabytes.

**Before any destructive operation — a reopen of an old period, a bulk correction, a migration that drops a column — take a manual dump first.** A settlement history is not something a house can reconstruct from memory.

---

## 13. Rolling a migration back

Supabase migrations are forward-only. There is no `migration down`, and writing
one would be worse than not having it: a down-migration that drops a column
destroys the data in it, which for this product is somebody's settled money.

**The rule: roll forward, not back.** A migration that turned out wrong is
corrected by the next migration.

| Situation | What to do |
|---|---|
| The migration has not been applied anywhere | Edit the file. Nothing has happened yet. |
| Applied locally only | `npm run db:reset` re-applies the whole chain from scratch. This destroys local data, which is the point of a local stack. |
| Applied to production, additive only — a new table, a new nullable column, a new function | Write the next migration to drop what the last one added. No data existed in it. |
| Applied to production and it changed or dropped existing data | **Stop.** Take a dump before doing anything else. Restore the affected tables from the most recent dump, into a scratch project first, and reconcile by hand. Then write the corrective migration. Do not re-run the original. |
| Applied to production and it is merely wrong, not destructive — a bad constraint, a bad policy, a bad default | The corrective migration is ordinary work. Ship it. |

Before pushing to production, always:

```bash
npm run db:reset          # the whole chain, from empty, locally
npm run test              # including every integration suite
npx supabase db diff --linked   # what push would actually do
supabase db dump --db-url "$PROD_DB_URL" -f "pre-push-$(date +%F).sql"
npm run db:push
```

`db diff --linked` is the step people skip and the one that catches a migration
that is already applied under a different name, or a hand-edit made in the
dashboard that the migration chain does not know about.

**A migration is never applied to production as part of a verification run.**
`npm run db:push`, a remote test run and a function deploy are separately
requested actions (D-59).

---

## 14. When something breaks in production

Each of these is a real failure mode with a first move that is not "look at the
logs". Logs are step two.

### A scheduled job did not run

Weekly generation, the digest, auto-confirm, the food refresh — all are
`pg_cron` calling an Edge Function.

```sql
-- Did cron fire at all?
select jobname, status, return_message, start_time
  from cron.job_run_details
 order by start_time desc limit 20;
```

| What you see | Cause | Fix |
|---|---|---|
| No rows for that job | The schedule is not installed | Re-apply migration 013 and section 3.2 |
| Rows with `status = 'failed'` and a connection error | `app_config` unset, so the job has no URL or key to call | Section 7, step 5. The `alter database` form fails on hosted Supabase — this is the exact failure it causes |
| Rows succeeded but nothing changed | The function ran and returned early | Function logs: `npx supabase functions logs <name>` |
| Everything stopped at once, days ago | The project paused after 7 idle days | Unpause, then verify the heartbeat job exists |

Every job is **idempotent by design**: re-invoking it for the same period is
safe. Recovery is to invoke it again, not to patch the data it should have
written.

### A notification was not delivered

```sql
select id, type, scheduled_for, push_sent_at, coalesced_into
  from notifications
 where user_id = '…' order by created_at desc limit 20;
```

| What you see | Meaning |
|---|---|
| Row exists, `push_sent_at` null, `scheduled_for` in the future | Quiet hours or availability deferral. Working as designed |
| Row exists, `coalesced_into` set | Folded into another notification by volume control. Working as designed |
| Row exists, `push_sent_at` null, `scheduled_for` past | The dispatcher did not run — treat as a failed job, above |
| `push_sent_at` set, nothing on the device | The subscription is dead. A 410 from the push service removes it; the member re-enables notifications to create a new one |
| Nothing for any user, from a fixed moment | VAPID mismatch, usually after a key rotation. Section 4.1 |

**The in-app feed is the source of truth, and push is best-effort.** A member who
never receives a push still sees the item. Never re-send by inserting rows by
hand.

### The money does not balance

The one class of incident to escalate rather than improvise on.

```sql
-- The closed period's stored balances must sum to zero.
select sum(final_net_paise)      as net,
       sum(penalty_owed_paise)   as penalties_owed,
       sum(penalty_credit_paise) as penalties_credited
  from member_period_balances
 where period_id = '…';

-- And the payments generated from them must net to zero as well.
select sum(amount_paise) from settlements where period_id = '…';
```

1. **Do not force the close.** The block is the invariant working.
2. Take a dump.
3. Find which of the three sums is off: splits against expenses, penalties
   against credits, or variance against the reserve.
4. Correct through a **balance adjustment**, which both parties agree to
   (`ADJUSTMENT_NEEDS_BOTH`), never with an `update`. An adjustment is visible
   in the record; a hand-edit is not, and a household that cannot see why a
   figure changed stops trusting every figure.

### A Home's AI stopped working

Expected and non-urgent — every call site has a deterministic equivalent that is
already what the member is seeing.

```sql
select created_at, purpose, accepted, error, validation_errors, latency_ms
  from llm_runs where house_id = '…' order by created_at desc limit 20;
```

`error` distinguishes a transport failure from a validation one; where `error` is
null and `accepted` is false, `validation_errors` names the check that rejected
the response. Both map onto the failure-modes table in section 11.1 of
[10-LLM-SPEC.md](10-LLM-SPEC.md). A 401 means the Home's key needs re-entering by
that Home — the operator has no key to substitute and should not acquire one.

### Escalation

| Severity | Example | Response |
|---|---|---|
| **1 — money is wrong** | Balances do not net; a settled figure changed | Stop writes to that Home. Dump. Reconcile before anything else |
| **2 — a control failed** | Cross-house data visible; a Critical decision resolved on one member's responses | Treat as a security incident: reproduce, patch, then check whether it happened elsewhere |
| **3 — a job or notification failed** | Generation missed a week | Re-invoke. Tell the Home what they missed |
| **4 — a feature degraded** | AI half missing; suggestions empty | Note it. The deterministic half is what the product promises |
