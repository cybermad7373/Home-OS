# HouseOS

A Home Operating System: the shared management of people, work, money, food,
calendar and decisions in one household — where everything is visible, everyone
can contribute, and the decisions that cause arguments belong to the Home rather
than to whoever set the app up.

It serves two shapes of household, and the difference is not cosmetic. A
**shared home** — flatmates — splits every rupee and nets the month down to who
pays whom, and an effort deficit costs money. A **family home** spends from one
pot, owes nobody anything at month end, and never charges a child for an unmade
bed. One question at setup picks the defaults; three settings underneath stay
editable.

The full design lives in [`docs/`](docs/00-INDEX.md). Read `00-INDEX.md` first;
everything in this repository follows from it.

> **The interface says Home. The schema says `house`.** The mapping is fixed,
> total and documented in `docs/01-BRD.md` section 0.1 (D-39).

## Where the build has reached

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Auth, house, members, rooms, app shell, PWA | **built** |
| 2 | Expense ledger, splits, approvals, recurring | **built** |
| 3 | Month close, netting, UPI settlement | **built** |
| 4 | Chore engine | **built** |
| 5 | Availability, guests, penalties | **built** |
| 6 | Household shapes, dependents, daily cost, categories | **built** |
| 7 | Notifications: push, escalation, digest, devices | **built** |
| 8 | Analytics and export | **built** |
| 9 | Intelligence: per-Home LLM key, three call sites | **built**, not yet applied to an environment — migrations 045 and 046 unpushed |
| 10 | Membership and Homes: multi-Home, invite links, request-to-join, Co-Admin | specified |
| 11 | Governance: decisions, approvals, quorum, absence, governed money | specified |
| 12 | Rules: plain text, AI parsing, versioning | specified |
| 13 | Food: meals, library, preferences, suggestions | specified |
| 14 | Today, Calendar and the new navigation | specified |
| 15 | Insights | specified |
| 17 | Native mobile clients: Android and iOS, native push, store releases (product phase 2) | planned |

**Specification 2.0 was adopted on 2026-08-26 and none of phases 10 to 15 is
built yet.** [`PROGRESS.md`](PROGRESS.md) carries the detail and the migration
notes; [`DECISIONS.md`](DECISIONS.md) records the choices, with D-39 to D-50
covering this version.

Money is live end to end: log an expense in about ten seconds, split it equally
or by room, approve anything above the house threshold, let rent post itself
every month, then close the month and settle up over UPI.

The work is live too: templates expand into a week, the solver assigns it
against the eight hard constraints, and a chore earns its points when somebody
other than the doer confirms it — or when the clock does, 48 hours later. The
schedule fits real lives, because it is built from each member's own hours and
the days they have declared away. And at month end an effort deficit becomes
money, credited to whoever carried the house.

And the house knows what it costs to run. `/money/daily` answers the question a
month-end total answers too late: what are we spending a day, is that more than
we meant to, and which category is doing it. Categories and their budgets are
the house's own — a temple fund, a dog, a shared car — rather than a fixed list.

Everybody who lives in the house is in the app, including the people who will
never open it. A child or an elderly parent is a resident with no login who
still counts as a head when the shopping is split, may hold chores their
guardian ticks off, and is never billed or fined.

And it reaches people who have not opened it. A chore reminder arrives when the
member is actually home rather than while they are on the bus; marking it done
takes one tap from the notification shade without opening the app at all; a
missed chore is private for two hours and then becomes a fact the house can see.
Six pushes a day is a hard ceiling, and the seventh is folded into one line
rather than sent — the limits are what keep the app installed. Settlement is the
one thing that cannot be muted, because a member who has silenced the app cannot
then say they were never told they owed money.

That is the whole of the original problem, for both kinds of household.

## What version 2.0 adds

Four things, specified and not yet built.

**Shared governance.** Version 1.0 let one person close a month, change a
penalty rate or remove a member. Version 2.0 puts every such action behind one
decision engine: the Admin proposes, the Co-Admin acknowledges, and the members
the Home's own policy requires respond. Nothing changes while a decision is
waiting, approval and application are separate states, and the database — not a
route handler — refuses to apply an unapproved one. Most of what a Home does
every day needs none of this; the rare, consequential, argument-causing actions
need all of it.

The property the whole version exists for: **in a Home of two or more people, no
single person's responses can complete a Critical decision.** It sits on the same
list as "splits sum exactly" and "settlements net to zero", because it fails the
same way — silently, while looking like a working feature.

**Rules the Home wrote.** An Admin types "nobody leaves unwashed vessels
overnight" and a model turns it into a structured proposal they then edit. AI is
a parser and never the authority: a rule goes live only through the same
governance flow, every version is kept, and each rule is edited and disabled on
its own. With no key configured the same rule is written through a form, and the
module is complete.

**Food as a module.** A meal is a named thing — "Paruppu Sadham", not "dinner" —
with items, a source, its own costs and the people who actually ate it. That
builds a library, which answers "what do we eat tonight" from the Home's own
history: two suggestions computed deterministically, with their reasons, next to
two AI ideas clearly marked as new. Recording food is never required, and no
money flow depends on it.

**One product rather than five screens.** Today, a real calendar, and one
Insights screen with filters instead of a page per report — with Approvals
promoted into the navigation the moment anything is waiting on you, because a
queue nobody sees is a Home that stops deciding things.

The product is intentionally delivered in two larger phases: first a production
web app/PWA, then native Android and iOS clients built against the same backend.
The numbered engineering milestones below those phases are implementation
checkpoints, not separate products.

## Running it

```bash
npm install
cp .env.example .env.local     # fill in the three Supabase values
npm run dev
```

The app needs a Supabase project. Either point it at a hosted one, or run the
local stack (`supabase start`, which needs Docker Desktop).

### Applying the schema

```bash
npx supabase link --project-ref <your-project-ref>
npm run db:push            # applies supabase/migrations to the linked project
npm run gen:types          # regenerates lib/types/database.ts from the live schema
```

Locally instead:

```bash
supabase start
npm run db:reset           # applies every migration, then supabase/seed.sql
```

## How the money works

- **Everything is integer paise.** Rupees exist only where a number is printed.
- **Splits are computed once, at creation, and stored** (BR-088). They are never
  recomputed on read, so what the house saw when it was logged is what the house
  is held to.
- **Splits always sum to the amount exactly.** The rounding remainder is handed
  out one paisa at a time in member-id order, and a deferred constraint trigger
  refuses the write at commit if the total ever disagrees. The property test in
  `tests/unit/split.test.ts` exercises this over ₹0.01 to ₹10,00,000 and 1 to 30
  members.
- **A vacant room's rent is a house cost**, split equally, not absorbed by the
  people who happen to still live in that room.
- **Nobody approves their own spending.** Refused by the function, and again by
  a check constraint if it ever got past.
- **Membership is dated**, so a July expense logged in August splits against
  July's household — including whoever has since moved out.
- **The settlement nets to exactly zero.** Every rupee somebody pays is a rupee
  somebody else receives. A non-zero sum is a defect, not a rounding question,
  and it blocks the close rather than being papered over.
- **At most n − 1 payments** for n members, by greedy largest-debtor to
  largest-creditor. Deterministic, so two people comparing screens see the same
  list.
- **The app never decides a payment happened.** The payer asserts it, the
  receiver confirms it, and the month locks only when the last one is confirmed.
- **A closed month is immutable in the database.** The service-role key bypasses
  RLS entirely and is still refused, because the trigger does not care who asks.
- **Closing and reopening a month are the Home's decisions, not the Admin's.**
  The Admin proposes; the Co-Admin acknowledges; the members the policy requires
  respond. The settlement rows are written when the decision applies, from
  apply-time numbers, and `apply_decision` refuses an unapproved one even to the
  service-role key.
- **A wrong balance is corrected, never edited.** A balance adjustment is a
  directed transfer both affected people approve. It sums to zero on its own, so
  the settlement invariant is untouched, and the original expenses stay exactly
  as they were.
- **Everyone sees who owes whom** — for everyone, netted pairwise, not only their
  own position. If A owes B ₹500 and B owes A ₹300, the Home sees A → B ₹200,
  and can open the two amounts underneath it.

## How the work works

- **Effort is points, not chore count.** Cooking dinner and wiping a table are
  not the same job, and counting them equally is what lets freeloading hide.
- **Low availability changes which chores you get. It never changes how many
  points you owe.** A member who leaves at seven and gets back at ten receives
  weekend-weighted work, not less work. Without that rule, "my job is demanding"
  becomes the new way to opt out. Capacity is a feasibility check and a
  tie-break, and it is deliberately absent from the target calculation.
- **Presence is different from busyness, and does reduce a target.** A declared
  away day, or a weekday-only residency, genuinely removes somebody from the
  house. Declaring a day away also moves that day's chores to whoever is
  furthest below target, so telling the house the truth is cheaper than staying
  quiet.
- **A chore earns its points only when other people confirm it** — a quorum sized
  to the Home, never including the person who did it — and silence auto-confirms
  after 48 hours. One peer is too weak in a house of eight, where whoever is
  nearest taps approve; an admin plus two others is impossible in a house of
  three. And a quorum with no timeout hands every Admin a veto over everyone
  else's points, which is the exact failure the mechanism exists to prevent.
- **Nothing is ever silently dropped.** A chore nobody can legally take is
  marked open and counted, rather than assigned to somebody who cannot do it.
  One infeasible assignment costs more trust than a dozen unscheduled chores.
- **A guest is their host's responsibility, twice over.** An extra head in the
  food split on the days they are here, and their share of the day's common work
  assigned to the host. Both land on the person who invited them.
- **Unpaid effort becomes money at month end.** A member who finishes the month
  in deficit pays the house rate per point, credited to the members in surplus.
  It is a pure transfer: `Σ owed = Σ credited` exactly, checked in the preview
  and again in the database, and a mismatch blocks the close.
- **A household's shape decides what money means, and it is asked once.** A
  family that spends its first month watching the app invent debts between a
  husband and a wife concludes the app is not for them, and they are right. Pot
  mode attributes an expense to whoever paid it, which makes the month net to
  nothing without a second code path anywhere.
- **A resident who cannot pay is still a head.** A dependent has no account, eats
  a share of the groceries, and has that share billed to their guardian —
  through exactly the arithmetic a guest's share already used. Leaving them out
  would make the per-head cost wrong in most families.
- **Shadow mode exists for the first month.** It shows the house what the rate
  would have cost without charging anybody, so the mechanism can be argued about
  before it takes money.

## Signing in

Three ways in, all landing on the same account:

| Method | How it works |
|--------|--------------|
| Username + password | The username lives on the profile, not in Supabase Auth. `POST /api/auth/signin` resolves it to an email server-side, then signs in. |
| Email + password | The same endpoint, skipping the resolution. |
| Google | Standard OAuth. It supplies no username, so onboarding asks for one before a house is chosen. |

Usernames are 3–20 characters, starting with a letter, then letters, digits or
underscores. Uniqueness ignores case and is enforced by a unique index on
`lower(username)` — the availability check in the form is a courtesy, not the
rule.

Resolution never runs in the browser. Anything that answers "which email owns
this username" from the client is an account-enumeration tool, so it lives
behind the service-role key in `lib/data/auth.ts`, and a failed sign-in gives
the same message whether the identifier or the password was wrong.

### Scheduled jobs

`pg_cron` runs inside the database, so nothing depends on the web tier being
awake — an effort week must close whether or not anybody has deployed lately.

| Job | When (IST) | What it does |
|-----|-----------|--------------|
| `post-recurring` | daily 06:00 | posts recurring expenses that have come due |
| `close-effort-week` | Sunday 19:35 | writes each member's carry for the week ending |
| `generate-weekly` | Sunday 20:05 | builds and publishes the coming week's schedule |
| `auto-confirm` | every 30 min | confirms work left hanging past the house's window |
| `mark-missed` | daily 23:55 | marks anything past its deadline as missed |
| `dispatch-notifications` | every 15 min | sends what has come due, within the daily cap |
| `schedule-chore-reminders` | daily 05:00 | lays down the day's reminders against today's availability |
| `escalate-missed` | hourly | posts a miss to the house, two hours after the private warning |
| `weekly-digest` | Sunday 21:00 | one summary per member |
| `warn-deficits` | Friday 19:00 | warns anybody more than 40 points behind, while the week can still be saved |
| `budget-alerts` | daily 20:00 | a category crossing 80 or 100 per cent, on the day it crosses |
| `settlement-reminders` | daily 10:00 | an unsettled payment, from day seven after the close |
| `prune-notifications` | monthly | drops feed entries older than 90 days |
| `heartbeat` | weekly | stops the free tier pausing the project |

The dispatcher runs every fifteen minutes rather than the hourly the spec asks
for, because a reminder due thirty minutes before a window cannot survive a
sixty-minute poll. See D-27.

The Sunday pair runs in that order deliberately: next week's targets are
computed from this week's carry, so the close has to land first.

They call Edge Functions through `call_edge`, which reads its URL and key from
the `app_config` table — a private table with RLS on, no policies, and no grants
to `anon` or `authenticated`. Set it once per environment:

```sql
insert into app_config (key, value) values
  ('supabase_url', 'https://<ref>.supabase.co'),
  ('service_key',  '<service-role key>')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

Then deploy the functions themselves (needs a logged-in CLI):

```bash
npx supabase login
npx supabase functions deploy post-recurring-expenses
npx supabase functions deploy generate-weekly-schedule
npx supabase functions deploy close-effort-week
npx supabase functions deploy auto-confirm-chores
npx supabase functions deploy mark-missed-chores
npx supabase functions deploy dispatch-notifications
npx supabase functions deploy schedule-chore-reminders
npx supabase functions deploy weekly-digest
```

Push needs a VAPID key pair of its own. Generate one, put the public half in
`.env.local` and both halves in the function environment:

```bash
npm run gen:vapid
npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
                         VAPID_SUBJECT=mailto:you@example.com APP_URL=https://...
```

With no pair configured nothing breaks: every notification still lands in the
in-app feed, which is the record either way.

Push is the only channel that leaves the app. Browser/PWA devices use the web
VAPID pair. Native Android/iOS clients will register through platform push
adapters in product phase 2; they are still device rows and one in-product
notification policy, but they do not reuse browser endpoints or VAPID keys
(D-34).

Until a function is deployed its cron job fires into a 404 and nothing happens.
The definitions are safe either way — every job is idempotent, so a late
deployment catches up rather than losing work.

### AI features (optional)

Every AI feature degrades to a deterministic path, so this section can be
skipped entirely and nothing breaks. What it buys is the written weekly digest,
a model's second opinion on the rota, plain-English entry, a first draft of a
house rule's structure, two new meal ideas, and help matching a typed dish name
to the food library.

Six call sites, and each is a switch of its own — a Home can have the meal ideas
without a model touching its rota. A capability that is off behaves exactly as no
key at all: the deterministic path, no banner, no error (D-49).

**AI is never authoritative over money, permissions, rules, approvals, chore
allocation or settlement.** Every output is a proposal a person confirms or a
validator accepts, and there is no path from a model's response to a stored fact
that skips both.

The key belongs to the house, not to this deployment: an admin picks a provider
at `/onboarding/ai` or `/admin/settings/ai` and pastes their own (D-35). What
the server needs is the master key that seals it before it is stored:

```bash
npm run gen:llmkey
# put LLM_KEY_ENCRYPTION_KEY=... in .env.local, then give the jobs the same value
npx supabase secrets set LLM_KEY_ENCRYPTION_KEY=...
```

With no master key set, saving a provider key fails with a plain message and
nothing is stored in plaintext. Rotation: add the new value as
`LLM_KEY_ENCRYPTION_KEY_V2`, set `LLM_KEY_ENCRYPTION_KEY_VERSION=2`, and keep the
old one until every row has been re-saved.

`LLM_PROVIDER` / `LLM_API_KEY` / `LLM_MODEL` remain as a fallback for a
single-house self-host and for development. A house that has entered its own key
never reads them, and a house whose own key was rejected does not fall back to
them either (D-38).

### Auth settings to check in the dashboard

- Email sign-up enabled. Turn email confirmation off for development, on for production.
- Google provider configured, with `<app-url>/auth/callback` in the redirect allow-list.
- Site URL set to the app's URL.

## Checks

```bash
npm run typecheck
npm run lint
npm run test               # unit tests; the RLS suite skips without Supabase env vars
npm run test:functions     # the Web Push round trip and key sealing, under Deno
npm run test:e2e           # the phase-1 journey, against a running app
```

`test:functions` is the one that matters most for notifications. An aes128gcm
frame is easy to build wrongly and impossible to inspect afterwards: a push
service answers 201 for a well-formed request whose ciphertext the browser will
then silently fail to decrypt. The test plays the receiver and decrypts what
`sendPush` produces, which is the only proof available without a physical phone.

The RLS isolation suite (`tests/integration/rls-isolation.test.ts`) is the proof
behind the phase-1 acceptance criterion that a member of house A receives zero
rows from house B. It creates and deletes real users — point it at a local stack
or a scratch project, never at production.

## Layout

```
app/          route groups: (auth), (onboarding), (app), and api/
components/   ui/ primitives, layout/ shell, and feature folders
lib/
  domain/     pure functions — no database, no framework
    expenses/     the split calculator, recurring dates, adjustments
    scheduling/   windows, demand, the eight hard constraints, the solver, quorum
    fairness/     targets, carry, the standing
    settlement/   netting, the penalty pool, UPI links
    governance/   decisions, resolution, participants, policy
    rules/        the rule model, versioning, the executed kinds
    food/         cost, library matching, preference, the recommender
    calendar/     day, week and month aggregation
    analytics/    insights transformers, the running daily cost, CSV
  data/       repositories; SQL lives here and in migrations, nowhere else
  infra/      supabase clients, and the LLM adapter — registry, transports,
              sealing, resolution, the circuit breaker
  validation/ zod schemas, shared by the client and the route handlers
  types/      generated database types plus domain types
  utils/      money (integer paise), dates (home timezone), invite tokens
supabase/
  migrations/ the schema, in order
  functions/  the Deno jobs pg_cron calls
tests/        unit (with property tests), integration, e2e
```

Three rules about that tree, from `docs/03-ARCHITECTURE.md`:

- No business logic in `app/`. A route handler validates, authorises, calls a
  domain function or a repository, and returns.
- SQL exists only in `lib/data/` and `supabase/migrations/`.
- `lib/types/supabase.ts` is generated and is overwritten whole by
  `npm run gen:types`. Hand-written aliases go in `lib/types/database.ts`, which
  is what everything imports.
- Anything a scheduled job needs exists twice, once in `lib/domain/` and once in
  Deno under `supabase/functions/`. That duplication is deliberate and the
  reasoning is in [`DECISIONS.md`](DECISIONS.md) D-06. Change one, change both.

## Things worth knowing before changing anything

- **Money is integer paise.** Rupees exist at the presentation boundary only.
- **Home isolation is RLS, not application code.** Every house-scoped table has
  a policy keyed on `house_id`, and every new table needs one plus a test.
- **`is_house_member` requires `status = 'active'`**, which is the entire
  implementation of "a Requested person has no permissions". Sixteen new tables
  inherit it for free; the loop test is what keeps that true.
- **The database enforces the rules that matter.** The last admin cannot be
  demoted, a room cannot exceed capacity, role and status are admin-only, a rule
  cannot activate without a decision, and an unapproved decision cannot be
  applied — all in Postgres, not only in a route handler.
- **Proposal and effect are always separate steps.** A model proposes and a
  validator disposes; a person proposes and the Home decides; a decision is
  approved in one transaction and applied in another. Nothing here goes from
  suggestion to fact in one move.
- **Dates are evaluated in the Home's timezone**; timestamps are stored in UTC.
