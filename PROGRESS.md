# Build progress

A running record of what has been built, what is verified, and what is next.
Updated at the end of every working session. The roadmap in
[`docs/07-ROADMAP.md`](docs/07-ROADMAP.md) is the plan; this file is the state.

**Last updated:** 2026-08-27

## Documentation alignment pass — 2026-08-27

The document set was audited against itself and against the code before starting
phase 10. **No application code changed.** Nine documents did:

| Document | What was wrong | What it says now |
|---|---|---|
| `docs/07-ROADMAP.md` | It never absorbed the phase-6 insertion. It had no household-shapes phase, no phase 9 at all, and numbered notifications 6, analytics 7 and intelligence 8 — off by one from this file, `README.md` and `DECISIONS.md` from phase 6 onward. | Phase 6 (household shapes, dependents, daily cost, categories) is written out, and 7/8/9 are notifications/analytics/intelligence. Native mobile moved 16 → **17**, which removes its collision with the 16+ offline queue. |
| `docs/07-ROADMAP.md` §4 | Claimed "nothing is unassigned" while AV-09, NT-08, EX-10, EX-11 and AI-10…AI-12 mapped to no phase, and AI-09 was mapped to 15+ as though it were an extension rather than a Must. | All 177 BRD requirement IDs map to a phase; verified by script. |
| `docs/05-API-SPEC.md` | Said the analytics member/effort/export endpoints had no route. All five `/api/analytics` routes ship. Fourteen shipped routes — the whole of `/api/auth`, `/api/profile`, `/api/receipts`, `/api/chores/pool`, `/api/chores/confirmations`, `/api/expenses/preview`, `/api/notifications/snooze` and others — appeared nowhere in the document. | New section 0 records every shipped endpoint the rest of the document does not specify, including the 1.0 invite-code and analytics routes that 2.0 replaces and the phase that removes each. Every one of the 67 route files is now documented. |
| `docs/04-DATABASE.md` | Three live tables were absent: `app_config`, `notification_types`, `notification_variants`. `notification_prefs` was missing `chore_outcomes`, `house_activity` and its quiet-hours check; `notifications` was missing `tag`, `priority`, `payload`, `scheduled_for`, `push_sent_at` and `coalesced_into`. | All three tables documented, both tables match the migrations. |
| `docs/13-SETUP-RUNBOOK.md` | Step 5 of production setup told you to run `alter database postgres set app.supabase_url = ...`, which **needs superuser and always fails on hosted Supabase** — the exact failure migration 021 was written to eliminate. Following the runbook produced a deployment whose scheduled jobs silently never fired. | The `app_config` insert, with the reason the other form fails, and a verification query. Function-secret names corrected. |
| `docs/03-ARCHITECTURE.md` | Named one Edge Function out of eight and no cron schedule anywhere. | The full inventory: fourteen `pg_cron` jobs with schedules and targets. |
| `docs/12-TEST-PLAN.md` | Projected ~320 unit / ~150 integration / 18 E2E with no statement of what exists. | An implementation-status block: 22 unit files, 8 integration, **1** E2E — the E2E gap is now stated rather than implied. |
| `SECURITY.md` | Listed `VAPID_PUBLIC_KEY` as an application variable. The app reads `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; only the Edge Functions use the unprefixed name. | Both names, and which side reads which. |
| `AGENTS.md` | "Engineering phases 1–7 are complete, analytics is partly delivered, intelligence is planned" — three phases stale. | Current state, plus the 2.0 documents to read before touching governance or AI. |
| `.env.example` | `LLM_KEY_ENCRYPTION_KEY_VERSION` and `LLM_BASE_URL` are read by the code and were undocumented. | Both present. |

What the audit did **not** find: no broken relative link in any document, no
undefined `D-` reference, and no disagreement between `DECISIONS.md`,
`README.md` and this file.

---

## Specification 2.0 adopted — 2026-08-26

The documentation set was rewritten to specification 2.0 on 2026-08-26, from
`docs/new_BRD.txt`. **No code has changed yet.** Everything below the "Phase
status" table describes what is built against specification 1.0 and remains
accurate; phases 10 to 15 are the new work.

What 2.0 changes, in one table:

| Area | 1.0 | 2.0 |
|---|---|---|
| What the product is | A chore-and-expense manager | A Home Operating System: People, Work, Money, Food, Calendar, Decisions, Insights |
| Who decides | The Admin | The Home. Admin initiates; Critical decisions need a Co-Admin and members (D-40 to D-42) |
| Roles | Admin, Member | Admin, Co-Admin, Member — and `Requested`, which is not a role |
| Joining | Invite code, or the Admin creates you | Invite link, you request, the Home accepts. **No admin-creates-member path** (D-44) |
| Chore confirmation | Any one peer | A quorum sized to the Home, with auto-confirm intact (D-43) |
| Rules | House settings | Plain text the Home wrote, parsed into a proposal, activated by governance, versioned forever (D-46) |
| Food | An expense category | A module: named meals, items, sources, costs, participants, a library, preferences, two-and-two suggestions (D-47, D-48) |
| Navigation | 5 tabs, `/dashboard` | 6 destinations plus Today and Calendar; Approvals promoted when pending (D-50) |
| Analytics | Four tabs | One filtered Insights screen over money, chores, food and the Home |
| AI | 3 call sites | 6, behind one router with per-Home capability switches (D-49) |

Documents rewritten or extended: 00 to 13, plus two new ones — `14-GOVERNANCE-SPEC.md`
and `15-FOOD-SPEC.md`. Twelve new decisions, D-39 to D-50.

**The property the whole version is for**, and the one to protect hardest:

> In a Home of two or more people, no single member's responses can complete a
> Critical decision.

It is on the same list as "splits sum exactly" and "settlements net to zero"
because it fails the same way — silently, while looking like a working feature.

## Product delivery phases

| Product phase | Goal | State |
|---|---|---|
| 1 — Web/PWA | Finish the web experience, analytics/AI scope, production hardening, and web launch | in progress |
| 2 — Native mobile | Android and iOS clients, native push, device integration, and store releases | planned |

The numbered engineering phases below are preserved for implementation history.
They are subphases of these two product phases, not an additional product
roadmap.

---

## Phase status

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Auth, house, members, rooms, app shell, PWA | complete |
| 2 | Expense ledger, splits, approvals, recurring | complete |
| 3 | Month close, netting, UPI settlement | complete |
| 4 | Chore engine | complete |
| 5 | Availability, guests, penalties | complete |
| 6 | Household shapes, dependents, daily cost, categories | complete |
| 7 | Notifications | complete |
| 8 | Analytics | complete |
| 9 | Intelligence (LLM) | built — migration 045 and the function secrets are not yet applied |
| **10** | **Membership and Homes** — multi-Home, invite links, request-to-join, Co-Admin, Inactive | **built — migrations 047–050 are not yet applied** |
| **11** | **Governance** — decisions, approvals, quorum, absence, governed money | **specified, not started** |
| **12** | **Rules** — plain text, AI parsing, versioning, history | **specified, not started** |
| **13** | **Food** — meals, library, preferences, recommendations | **specified, not started** |
| **14** | **Today, Calendar and navigation** | **specified, not started** |
| **15** | **Insights** — one filtered screen | **specified, not started** |
| 17 | Native mobile clients | not started — follows web/PWA launch |

Phase 6 was not in the original `docs/07-ROADMAP.md`. It was added when the
product had to serve two household shapes rather than one, which renumbered
everything after it. The roadmap carried the pre-insertion numbering until
2026-08-27 and now matches this table: household shapes at 6, notifications at
7, analytics at 8, intelligence at 9. Phases 10 to 15 are the
specification-2.0 additions, and the native-mobile phase moved from 10 to 17
with them — 15+ is the post-v2 extension set and 16+ the offline queue, both
still inside product phase 1.

**Nothing in phases 1 to 9 is discarded.** Version 2.0 extends that work. What it
changes in place is listed per phase in `docs/07-ROADMAP.md`, and the two changes
that touch shipped behaviour are the `member_status` enum rename in phase 10 and
the move of close, reopen, removal and confirmation behind decisions in phase 11.

---

## Verification state

Run from the repository root:

| Check | Command | Result on 2026-08-26 |
|-------|---------|----------------------|
| Types | `npm run typecheck` | clean |
| Lint | `npm run lint` | clean |
| Build | `npm run build` | clean |
| Unit, property and integration tests | `npm run test` | 384 passing across 29 files, 6 skipped |
| Edge function types | `npx deno check supabase/functions/*/index.ts` | all eight clean |
| Web Push and key sealing | `npm run test:functions` | 9 passing |
| End-to-end | `npm run test:e2e` | phase-1 journey only |

The six skipped tests are `tests/integration/llm-credentials.test.ts`. They skip
themselves when `house_llm_credentials` is not in the schema cache, which is the
case until migration 045 is pushed — a state of the environment rather than a
defect, and the suite says so rather than failing.

Nothing is failing. Every migration through 044 is applied, the generated types
match it, and all eight Edge Functions are deployed. A VAPID pair is generated and set as function
secrets; the public half is in `.env.local`.

The three notification jobs were invoked once after deployment and answered:

```
dispatch-notifications   -> {"due":0,"pushed":0,"coalesced":0}
schedule-chore-reminders -> {"scheduled":0,"skipped":0}
weekly-digest            -> {"week_start":"2026-08-24","sent":0,...}
```

and the dispatcher was then run against a real enqueued row, which came back
stamped `sent_at` with `channel = in_app` — the correct outcome for a member
with no device registered yet.

**Telegram was removed before it ever ran** (migration 044, D-34). It was built
as the fallback for members whose push does not arrive, no bot token was ever
configured, and the native app answers the same need better: it is another
registered device reached through a native push adapter, not another user-facing
network. What replaces the bot in settings is a device list — every
place push reaches you, with a label, a last-used time and a remove control.

**Nothing has received a real push yet**, because no browser has subscribed. The
encryption is proved correct by `npm run test:functions`, which decrypts what
`sendPush` produces the way a browser would; what is untested is the last hop
through a live push service.

---

## Phase 4 — chore engine

Delivered:

- **Schema.** `chore_templates`, `chore_assignments`, `schedule_runs`,
  `effort_ledger`, `chore_swaps` with their RLS policies, indexes and triggers
  (migrations 027, 028, 030).
- **Domain.** Demand expansion, availability windows, the eight hard
  constraints, target computation with carry, and the greedy-plus-local-search
  solver — all pure functions in `lib/domain/scheduling/` and
  `lib/domain/fairness/`, with no database or framework dependency.
- **Lifecycle.** Done, confirm, reject, retry, miss, swap, release and claim, as
  `security definer` functions so the rules live in Postgres rather than in a
  route handler.
- **Jobs.** `close-effort-week`, `auto-confirm-chores`, `mark-missed-chores` and
  `generate-weekly-schedule` as Edge Functions, scheduled by `pg_cron`
  (migration 029).
- **API.** Fourteen route handlers under `app/api/chores/`, `app/api/effort/`
  and `app/api/swaps/`.
- **UI.** House week view, personal chore view, the standing leaderboard, the
  template admin screen and the generation panel.

Acceptance criteria, against `docs/07-ROADMAP.md` section 3:

| Criterion | Where it is proved |
|-----------|--------------------|
| Every instance assigned or explicitly open | `tests/unit/scheduling.test.ts` — "assigns or opens every instance" |
| No hard-constraint violation, over randomised availability | same file — the `fast-check` property test |
| Confirmation posts points exactly once | `tests/integration/chore-lifecycle.test.ts` |
| Auto-confirm at the house window | `supabase/functions/auto-confirm-chores` |
| Self-confirmation refused by the database | `confirm_chore`, plus a check constraint |
| Leaderboard shows earned, target and carry | `components/chores/leaderboard.tsx` |
| 30 members and 200 instances under 5 seconds | `tests/unit/scheduling.test.ts` — NFR-03 case |

The roadmap's deliberate simplification still holds: every member is treated as
available in every slot. Phase 5 supplies the real windows, and the only line
that changes is where `buildWeekWindows` is called.

---

## Phase 5 — availability, guests, and the penalty

Built, pending the three migrations above.

- **Availability.** Seven-day capture in onboarding and at `/house/availability`,
  with the derived-windows preview computed live in the browser and again on the
  server. Real windows are wired into generation on both paths — the app's and
  the scheduled job's — replacing the phase-4 placeholder.
- **Exceptions.** Declare a day away, home all day, or on different hours, at
  `/house/away`. Declaring an away day against a published week redistributes
  that day's outstanding chores immediately, to whoever is furthest below target,
  and opens anything nobody can legally take.
- **Presence-adjusted targets.** Residency and declared absence reduce a target.
  Being busy does not (D-15).
- **Guests.** Registration at `/house/guests`, an extra head in the expense split
  billed to the host, and a proportional share of the day's common work assigned
  to the host under HC-7. A guest registered against a week already published
  gains chores on the remaining nights only.
- **The penalty.** Month-end carry is read from `effort_ledger`, converted at the
  house rate, and credited to the members in surplus. `Σ owed = Σ credited` is
  checked in the preview, again in `close_period`, and proved by property test.
  Shadow mode shows the house what the rate would cost without charging it.

### What phase 5 fixed on the way

Two defects in the phase-4 code, both silent:

1. **Nothing wrote the weekly targets.** Every carry came out zero and the whole
   deficit mechanism did nothing. See D-14.
2. **`presentDays` was hardcoded to 7.** A weekday-only member was given a
   full-week target they could not meet. See D-15.

A third gap: the `generate-weekly` cron job pointed at an Edge Function that did
not exist, so no week was ever generated automatically. It exists now, along
with the service-role publish path it needs (D-13).

### Acceptance criteria

| Criterion | Where it is proved |
|-----------|--------------------|
| A member who leaves at 07:00 gets no morning chore | `tests/unit/availability.test.ts` |
| A busy member's target equals everybody else's | same file — the contested rule |
| An away day redistributes and reduces the target | same file, plus `redistributePublishedDay` |
| A weekend guest appears in Saturday's schedule, billed to their host | same file |
| A guest is in Saturday's expense head count | `tests/unit/split.test.ts` |
| `Σ penalty_credit = Σ penalty_owed` | same file — property test over 300 cases |
| No hard constraint violated, for any pattern or exception | same file — property test |

Still outstanding: an integration test for the penalty reaching a stored
settlement, which needs migration 033 applied first.

---

## Phase 6 — household shapes, dependents, daily cost, categories

The product was built for one household: eight equal flatmates who split every
rupee and owe each other points. A family is not that, and telling a family the
app will net their month into "Amma pays Appa ₹3,180" is not a feature.

### What the shape changes

| | Shared home | Family home |
|---|---|---|
| Money | every expense splits; the month nets into payments | one pot: the expense sits on whoever paid and creates no debt |
| Settling up | the point of the month | hidden — there is nothing to settle |
| Chore deficit | costs money at the house rate | shows as points and never becomes rupees |
| Dashboard tile | what you owe the house | what the house is spending |

Chosen once at house creation as `household_type`, which only sets the defaults.
`money_mode`, `effort_mode` and `penalty_enabled` are three independent settings
underneath and are editable at any time (D-21).

### Residents without accounts

A child eats a share of the shopping and owns no phone. `member_kind` is now
`adult` or `dependent`; a dependent may have no `user_id`, carries their name on
the membership row, and has `shares_cost` and `does_chores` flags of their own.
Their share of an equal split lands on their guardian, through the same
arithmetic a guest's share already used (D-23). Their guardian may mark their
chores done but may not confirm them (D-24).

### The running cost

`/money/daily`. What the house is spending per day, per head where that means
anything, against a daily budget it can set; a bar per day for the month;
category spend against category budgets; and a projection for the month at the
rate so far. Month-to-date totals arrive too late to act on — a daily rate is
something you can change on the way to the shop.

### Categories

`/house/categories`. Custom categories, icons and monthly budgets have existed
in the API since phase 2 with no screen anywhere. Now there is one, and the
month-to-date figures come from the same summary the running-cost screen uses,
so the two can never disagree.

### Defects found and fixed along the way

1. **`splitEqual` could produce shares that did not sum to the amount.** A guest
   whose host had moved out was counted in the divisor and charged to nobody
   (D-25).
2. **`publish_schedule_for_house` was callable by any signed-in user.** Its
   revoke named `anon` and `authenticated` and left the `PUBLIC` grant Postgres
   creates by default. Any member of any house could overwrite any other house's
   week (D-20).
3. **Migration 035 dropped the chore-template seeding from `create_house`** by
   rewriting it from a copy that predated the chore engine (D-19).
4. **`npm run gen:types` had been overwriting hand-written type aliases** at the
   foot of the generated file, breaking thirty imports (D-26).

### Acceptance criteria

| Criterion | Where it is proved |
|-----------|--------------------|
| A family's grocery bill counts every mouth and bills only the guardians | `tests/unit/household.test.ts` |
| A dependent never gets a split row of their own | same file — property test, 400 cases |
| Shares sum exactly, for any mix of payers, dependents and guests | same file — same property test |
| A month of pot-mode expenses nets to nothing | same file |
| A guest whose host left is not a head, and the sum still holds | same file |
| A guardian cycle terminates instead of hanging | same file |
| A children-only bedroom does not divide its own rent | same file |
| The daily average counts days with no spending | `tests/unit/daily-cost.test.ts` |
| The chart and the headline figure are the same money | same file — property test, 300 cases |
| A projection is never below what has already been spent | same file — property test |
| The scheduled job still cannot be called from a browser | `tests/integration/chore-lifecycle.test.ts` |

---

## Phase 7 — notifications

The app can now reach a member who has not opened it. That is the point of the
phase, and it is the mechanism by which the house's least engaged members are
actually engaged — which also makes it the fastest way to be uninstalled. The
volume caps are not decorative, and they are enforced in two places.

### What was built

- **Schema** (migration 040). `notifications`, `notification_prefs`,
  `push_subscriptions`, with their policies. A notification is addressed to one person and readable only by them:
  N-12 reaches the house by being written to everybody, not by being readable by
  everybody. There is no insert policy on `notifications` anywhere — every row
  arrives through a `security definer` function.
- **The catalogue** (migration 041). All thirty types from
  [`docs/11-NOTIFICATIONS-SPEC.md`](docs/11-NOTIFICATIONS-SPEC.md) section 2, as
  a table carrying their copy, category, priority and quiet-hours exemption,
  plus `enqueue_notification`, which renders and de-duplicates. Triggers on
  chores, expenses, swaps, settlements, memberships and guests produce the
  event-driven types.
- **The time-driven types** (migration 042). Escalation two hours after a miss,
  the Friday deficit warning, budget thresholds at 80 and 100 per cent, the
  unsettled reminder from day seven, and the ninety-day prune — plain SQL on
  `pg_cron`, because they only write rows.
- **Domain** (`lib/domain/notifications/`). The availability-aware reminder
  rule, quiet hours, the priority order and the daily cap, as pure functions
  with no database and no framework in them.
- **Delivery.** `dispatch-notifications` every fifteen minutes (D-27),
  `schedule-chore-reminders` daily and `weekly-digest` on Sunday evening. Web
  Push is implemented against Web Crypto rather than imported (D-31), and it is
  the only channel that leaves the app (D-34).
- **UI.** The feed at `/notifications` with its actions inline, settings at
  `/house/notifications`, the permission ask at `/onboarding/notify`, and the
  bell with its count on the dashboard.
- **Service worker.** `push`, `notificationclick` with the `done`, `confirm` and
  `later` actions, and `pushsubscriptionchange`. Marking a chore done from the
  notification shade removes every step between remembering and recording.

### What phase 7 fixed on the way

Two defects, one in new code and one that had been shipping since phase 2.

**The approval request never told you your own share.** N-18 read "Your share:
₹—". `create_expense` writes the expense row and then the split rows in one
transaction, so an ordinary `after insert` trigger fires between the two, when
there is no split to read. Migration 043 makes it a deferred constraint trigger,
which runs at commit with the splits in place. The notification the house sees
most often is now the one that answers the question it raises.

**A property test found a real defect in the cap.** A member who had already had
their six pushes, with more still due, was sent a seventh — the coalesced digest
itself. The digest counts against the cap like anything else, so an overflow now
sends five and a digest, and a member whose allowance is spent gets nothing
further that day. The Edge Function carried the same bug and was corrected with
it.

### Acceptance criteria

Against the roadmap's notifications phase and section 9 of the notifications
spec:

| Criterion | Where it is proved |
|-----------|--------------------|
| A reminder arrives before the window and never inside quiet hours | `tests/unit/notifications-timing.test.ts` |
| A member returning at 19:00 is reminded near 19:00, not at 09:00 | same file — the spec's own worked example, at 22:00 |
| A reminder scheduled for 23:30 is delivered at 07:00 | same file, plus a property test over 500 cases |
| Marking a chore done pushes a confirmation request to the others | `tests/integration/notifications.test.ts` |
| The seventh notification in a day is coalesced, not sent | `tests/unit/notifications-volume.test.ts` |
| An expired subscription is deleted without breaking the batch | `supabase/functions/dispatch-notifications` — 404 and 410 are collected and deleted after the loop |
| Every type writes a feed row even when both channels fail | `tests/integration/notifications.test.ts` |
| A disabled category produces no push and still produces a feed row | same file |
| The same tag within ten minutes replaces rather than adds | same file, and again in unit |
| N-11 always precedes N-12 by two hours | `escalate_missed_chores` — the `exists` clause on a sent N-11 |
| Settlement cannot be switched off | `tests/integration/notifications.test.ts` |
| One member cannot read another's feed | same file |
| The database and the client never disagree about the copy | `tests/unit/notifications-copy.test.ts` |

---

## Phase 8 — analytics

The existing running-cost summary is now joined by the first analytics slices:
approved spend is grouped by month and category through
`GET /api/analytics/spend`, budget status is exposed through
`GET /api/analytics/budgets`, and `GET /api/analytics/members` compares each
member's approved payments with their stored fair share for a selected month.
`GET /api/analytics/effort` reports the monthly share of confirmed effort earned
by the top three members. `/analytics` renders responsive trend, category,
budget, member-comparison and effort-concentration views. The pure grouping
transformers are covered by
`tests/unit/analytics-report.test.ts`.

### Export

`GET /api/analytics/export` answers with a CSV download rather than JSON: the
content type, a filename and a UTF-8 byte-order mark, which is the only way
Excel reads a rupee amount or a name that is not ASCII. Five exports, one per
analytics tab — `expenses`, `spend`, `members`, `effort`, `budgets` — and the
`/analytics` screen links to each of them as a plain download.

The serialiser is a pure function in `lib/domain/analytics/csv.ts`. Two rules in
it are load-bearing: RFC 4180 quoting with CRLF endings, and a formula-injection
guard. A category may be called anything a member types, including
`=cmd|' /c calc'!A0`, and a spreadsheet executes that on open unless the field
is neutralised. Plain numbers are exempt, so a negative net position is still a
number rather than text.

### Budget alerts

The producer was already in place — `check_budget_thresholds`, plain SQL on
`pg_cron` at 20:00 IST (migration 042) — but nothing proved it. It is now
covered by `tests/integration/budget-alerts.test.ts` against a real database:
silent under four fifths of the budget, one alert to every member on the day
80 per cent is crossed, a second at 100, and never the same threshold twice in
a month. The repeat rule is the point of the test — an alert that fires every
evening for a fortnight is how a house turns notifications off.

### Acceptance criteria

| Criterion | Where it is proved |
|-----------|--------------------|
| The top-three concentration ratio is a chart with a month-by-month trend | `components/analytics/analytics-panel.tsx`, from `GET /api/analytics/effort` |
| A budget breach produces an alert on the day it happens | `tests/integration/budget-alerts.test.ts` |
| The same breach is not re-announced for the rest of the month | same file |
| Export opens correctly in a spreadsheet | `tests/unit/analytics-export.test.ts` — every field is parsed back with an RFC 4180 reader, over a 300-case property test |
| A category named like a formula cannot execute on open | same file |
| Rupees export as a plain decimal, paise-exact | same file |

---

## Phase 9 — intelligence

Built on 2026-08-26 against `docs/10-LLM-SPEC.md` v2.0. Every part of it is
optional: with no key configured anywhere, all three call sites take the
deterministic branch they already had, and the whole suite passes — which is the
gate the specification sets and the reason the phase could be built without a
provider account.

### What was built

- **Migration 045.** `llm_credential_status`, `house_llm_credentials` with RLS
  and no `select` policy at all, the `house_llm_config` view (`key_last4`,
  status, last error — nothing secret), `llm_runs` readable by admins only, and
  `set_house_llm_credential` / `delete_house_llm_credential` as admin-checked
  `security definer` functions. It also seeds N-31, the one notification the
  phase adds.
- **Sealing.** `lib/infra/llm/crypto.ts` — AES-256-GCM over Web Crypto, the
  house id as additional authenticated data, `key_version` for rotation — with
  its Deno twin at `supabase/functions/_shared/llm/crypto.ts` for the jobs
  (D-06), and `npm run gen:llmkey`.
- **The registry and the transports.** Nine providers as data in
  `lib/infra/llm/providers.ts`, six of them with a free tier, over three
  transports: `openai-chat`, `gemini`, `anthropic` (D-36).
- **The adapter.** `complete()` with the seven guarantees — never throws, 20 s
  timeout, exactly one retry on a network error or 5xx, JSON mode where the
  provider has one, schema validation before returning, an `llm_runs` row for
  every call including failures, and the key held in a local variable for one
  request. Plus `resolveLlm(houseId)` with its three-step resolution, the
  circuit breaker and the credential-status transitions (D-37, D-38).
- **Routes.** `GET /api/ai/providers`, `GET|PUT|DELETE /api/ai/credentials`,
  `POST /api/ai/credentials/verify`, `POST /api/ai/parse`, `GET /api/ai/digest`.
- **UI.** The optional wizard step at `/onboarding/ai`, the same panel at
  `/admin/settings/ai`, the natural-language field above the expense list, and
  the acceptance-rate panel on the admin schedule view.
- **The three call sites.** The schedule overlay inside `generateWeek`, the
  digest in the route and in the `weekly-digest` Edge Function, and
  natural-language entry that pre-fills a form and never writes.

### Acceptance criteria

| Criterion | Where it is proved |
|-----------|--------------------|
| Every feature works with no key configured | the whole suite runs with none, and `resolveLlm` returns null |
| Registry integrity — URL, default model, transport | `tests/unit/llm-providers.test.ts` |
| A mocked 500 retries exactly once; a schema failure never does | `tests/unit/llm-adapter.test.ts` |
| A key sealed for house A does not open for house B | `tests/unit/llm-crypto.test.ts`, and again in Deno |
| A version-1 row still opens after version 2 becomes the write key | same file |
| With no master key, saving fails and nothing is written | same file, plus `LLM_SEALING_UNAVAILABLE` in the route |
| No `llm_runs` row or response body carries the key | `tests/unit/llm-adapter.test.ts` |
| Redaction — no UUID, email or long number in a payload | `tests/unit/llm-schedule.test.ts`, property test over 200 cases |
| Invalid proposal — missing instance, HC-1, HC-3, HC-6 | same file |
| A proposal that gives all the work to one member is refused | same file — the deviation check |
| A digest that hallucinates a name or a number is refused | `tests/unit/llm-digest.test.ts` |
| The template digest passes the same validator it falls back to | same file |
| A parse below 0.70 empties the form and shows the clarification | `tests/unit/llm-parse.test.ts` |
| An unknown category falls back to Other; an impossible amount is refused | same file |
| Three failures open the breaker for an hour | `tests/unit/llm-adapter.test.ts` |
| RLS: a member gets zero rows from the credential table, and the view without ciphertext | `tests/integration/llm-credentials.test.ts` — **skipped until migration 045 is applied** |
| A non-admin calling `set_house_llm_credential` is refused by the database | same file, same condition |

### What is not done, and needs an environment rather than code

1. **Migrations 045 and 046 have not been pushed.** `npm run db:push` against the intended
   project applies it; until then the AI panel cannot save a key and the six
   integration tests skip themselves.
2. **`LLM_KEY_ENCRYPTION_KEY` is not set.** `npm run gen:llmkey`, then the same
   value in `.env.local` and in `npx supabase secrets set`.
3. **`weekly-digest` has not been redeployed** since it learnt to ask a model
   for the prose. Until it is, the deployed job sends the numeric digest — which
   is the correct fallback, not a failure.
4. **No provider key has been exercised end to end.** Every transport is proved
   against a stub; none has been proved against a live provider account.

---

## Phase 9 — the plan it was built from

The plan changed on 2026-08-25, before any of it was built. The key is now the
house's rather than the deployment's: the admin picks a provider and pastes
their own key while creating the house, and it is stored encrypted against that
house. The reasoning is D-35, and the provider model is D-36. The specification
is rewritten as `docs/10-LLM-SPEC.md` v2.0, whose sections 2 and 3 are new; the
three call sites are unchanged apart from how they obtain a provider.

What this touches, in the order it should be built:

1. **Migration 045.** `llm_credential_status`, `house_llm_credentials` with RLS
   and no `select` policy, the `house_llm_config` view, the `llm_runs` table
   from `docs/04-DATABASE.md`, and `set_house_llm_credential` as an admin-only
   `security definer` function.
2. **Sealing.** `lib/infra/llm/crypto.ts` over Web Crypto — AES-256-GCM, house
   id as additional authenticated data, `key_version` for rotation — plus the
   same module under `supabase/functions/_shared/llm/` for the jobs, and
   `scripts/generate-llmkey.mjs` behind `npm run gen:llmkey`.
3. **The registry and the transports.** `lib/infra/llm/providers.ts` as data,
   and three transports: `openai-chat`, `gemini`, `anthropic`. Nine providers
   ship, and the first six have a free tier.
4. **The adapter.** `complete()` with the seven guarantees, `resolveLlm(houseId)`
   with its three-step resolution, the circuit breaker, and `llm_runs` logging
   that records provider and model but never the key.
5. **Credential routes.** `GET /api/ai/providers`, `GET /api/ai/credentials`,
   `POST /api/ai/credentials/verify`, `PUT` and `DELETE`, per
   `docs/05-API-SPEC.md` section 10.
6. **The UI.** `/onboarding/ai` as screen S-06b, optional and skippable, and the
   same panel at `/house/settings/ai`.
7. **The three call sites**, unchanged from the v1.0 spec: digest, schedule
   proposal with whole-proposal rejection, and natural-language entry that never
   writes without a tap.

The gate stays what it has always been, restated: the whole suite passes with no
key anywhere — none in the environment and none in `house_llm_credentials`.
Added to it are the secrecy tests in section 10 of the spec, of which the one
that matters most is that no route response, log line or `llm_runs` row ever
carries a stored key.

---

## Phase 10 — membership and Homes

Built on 2026-08-27 against `docs/07-ROADMAP.md` phase 10, `docs/04-DATABASE.md`
§§2.1, 3.1 and 4.1, and `docs/05-API-SPEC.md` §2.1. Migrations 047 to 050 are
written and **applied to no environment** — no local Postgres was available on
the machine that built it, so every claim below is proved by typecheck, lint,
build and the unit suite, and the database-level claims are proved by tests that
skip themselves until a `db push` has happened.

### What was built

- **Migration 047 — the two enum edits, alone.** `member_role` gains `co_admin`;
  `member_status` renames `pending` to `requested`. Nothing else, because
  `alter type … add value` may not be used in the transaction that adds it and
  the Supabase CLI wraps each file in one. Its header carries the classification
  of all seventeen `'pending'` grep hits by enum, so the file is reviewed against
  that list rather than against the raw grep — `swap_status` and
  `settlement_status` each have a `pending` of their own and are untouched.
- **Migration 048 — the operational tier.** `is_house_lead()` ships with the
  enum value it needs, so no policy written in phases 11–15 has to be
  back-patched. `role` becomes nullable with `requested_has_no_role` tying it to
  status in both directions (HM-07). `chore_templates`, `rooms` and
  `expense_categories` move to lead-write; `house_settings` stays Admin-only.
  The privileged-column trigger is restated with `is distinct from` — a
  nullable `role` made `<>` return null, which would have let a role change
  through silently — and with a last-Admin guard.
- **Migration 049 — HM-06.** `invitations` and `join_requests` with their RLS
  and their security-definer functions: `rotate_invitation`,
  `lookup_invitation` (public), `request_join`, `accept_join_request`,
  `decline_join_request`, `withdraw_join_request`. `household_type` becomes
  `home_type`, and the four location columns arrive. `join_house` and
  `regenerate_invite_code` are **dropped**, which is what makes "there is no
  endpoint anywhere that could have created them without asking" checkable
  rather than asserted.
- **Migration 050 — leaving with money outstanding (D-45).** `pending_settlement`
  and `removal_decision_id`, `member_is_financially_clear`,
  `begin_member_removal` (revoked from every client role) with the
  `remove_member` wrapper a person reaches, and the daily
  `complete-pending-removals` job.
- **The selected Home, as one accessor.** `getMembership` resolves an httpOnly
  cookie against the caller's memberships and falls back to their default when
  it names a Home they cannot use. Every route and server component already went
  through it, so all 67 shipped handlers became Home-aware with no edit —
  section 2.3 of the implementation plan, done where it was cheapest.
- **`lib/data/homes.ts` and the 2.1 routes.** `GET /api/homes`,
  `POST /api/homes/select`, `GET|POST /api/invitations`,
  `DELETE /api/invitations/:id`, `GET /api/join/:token`,
  `POST /api/join/:token/request`, `GET /api/join-requests`, and accept and
  decline. `POST /api/houses/join` and `POST /api/houses/current/invite-code`
  are deleted per `docs/05-API-SPEC.md` §0.5.
- **Screens.** `/join/[token]` as a public landing page, `/homes` for the My
  Homes cards, the Home switcher in the shell, the requests queue on
  `/house/members`, and `/onboarding/pending` rewritten — it used to poll a
  `house_members` row that a waiting person no longer has.
- **`PATCH /api/members/:id` loses `status`.** Approval is
  `POST /api/join-requests/:id/accept`; removal is `DELETE /api/members/:id`,
  which reports which of D-45's two states it landed in. Role changes are
  Admin-only in the route and in the trigger.

### What phase 10 found on the way

1. **`gen:types` cannot run against an unmigrated database, and the generated
   file may not be hand-edited.** The answer is `lib/types/schema-pending.ts`, a
   hand-written overlay merged into `Database` in `lib/types/database.ts`. It
   carries its own deletion instructions, and it is what made the enum rename a
   compile error at 24 call sites instead of a runtime surprise. Recorded as
   D-51.
2. **The privileged-column trigger would have blocked its own removal job.** It
   asks `is_house_admin`, which reads `auth.uid()`; a cron run has none. The fix
   is a transaction-local `app.member_write_authorised` setting that only the
   security-definer removal path sets. Recorded as D-52.
3. **`revoke … from anon, authenticated` is not a revoke.** Postgres grants
   EXECUTE to PUBLIC, which both roles inherit — the lesson migration 037 exists
   to record. Every new function here revokes from `public` as well.
4. **A person with an open request has no membership row at all.** Every screen
   and test that asked "is this member pending?" had to be re-asked as "does
   this person have an open request?" — the waiting screen's poll, the member
   list's approval queue, and the RLS test that proved BR-003.

### Acceptance criteria

| Criterion | Where it is proved |
|-----------|--------------------|
| A person opens a link, asks, is accepted, appears as Active | `tests/integration/membership.test.ts`, and the Playwright journey in `tests/e2e/foundation.spec.ts` |
| No endpoint could have created them without asking | `join_house` and `regenerate_invite_code` dropped in 049; the only reachable insert is `accept_join_request`, which needs a request the person raised |
| Somebody with an open request gets zero rows from every table in that Home | `membership.test.ts`, iterated over nineteen tables rather than asserted one by one |
| A Requested row has no role, and a role on one is refused by the database | `membership.test.ts` — attacked with the service-role key, which bypasses RLS and not a check constraint |
| A person in several Homes; a role in one means nothing in another | `membership.test.ts`, via `is_house_lead` in both directions |
| Rotating the link kills the old one and touches no membership or open request | `membership.test.ts` |
| Removal with money outstanding stays in the settlement and completes when the last payment is confirmed | `membership.test.ts` — including that `complete_pending_removals` leaves them alone until it is |
| Every previously-`'pending'` test passes against `'requested'` | the unit suite: 388 passing |
| HM-20: a new Home is usable before it is configured | `membership.test.ts` — an Admin, categories, chore templates and a live link exist the moment the Home does |

### What is not done, and needs an environment rather than code

1. **Migrations 047–050 have not been pushed**, so `tests/integration/membership.test.ts`
   and the two phase-10 cases in `rls-isolation.test.ts` skip themselves. They are
   the whole database half of the acceptance table above.
2. **`npm run gen:types` has not been re-run.** Until it is,
   `lib/types/schema-pending.ts` is load-bearing. Delete the entries the
   regenerated file covers; anything still there afterwards is an unpushed
   migration.
3. **Phase 9's environment gap is still open** — migrations 045 and 046, the
   master key, and the `weekly-digest` redeploy. Phase 10 did not close it and
   does not depend on it.

---

## Known gaps and follow-ups

- **Specification 2.0 is partly built.** Phase 10 is written; five engineering
  phases (11 to 15) stand between the current code and the specification. The order in
  `docs/07-ROADMAP.md` is not arbitrary: membership before governance, because a
  decision needs participants and participants need roles; and governance before
  rules, food's navigation slot and the Approvals surface, because retrofitting a
  decision engine under four features that each grew their own approval flow is
  precisely the outcome the engine exists to prevent.
- **One shipped behaviour still changes in place.** The `member_status` rename
  landed in migration 047 with its grep classified by enum first. What remains is
  phase 11's: close, reopen, removal and chore confirmation move behind decisions,
  and their existing routes become proposers rather than being deleted, so an
  un-updated client gets `409 DECISION_REQUIRED` rather than a 404.
- **The web/PWA launch gate is not yet met.** Intelligence is built but not
  applied to any environment (migration 045, the master key, and a redeploy of
  `weekly-digest`), and production release checks — privacy and support pages,
  monitoring, backups, and a real-device smoke test — still need to be completed
  before calling product phase 1 launched. Specification 2.0 widens what phase 1
  contains; it does not change that gate.
- **Native mobile is a separate product phase.** It must not be described as a
  wrapper with “no backend change”: native push uses a provider adapter and
  platform token lifecycle, while the shared API and device model remain the
  contract. Android Play and iOS App Store release work is intentionally deferred.

- **The integration suites run against the live remote project**, so they can
  fail on a dropped connection rather than on a defect. One such failure was
  seen on 2026-08-24 and did not reproduce over five consecutive runs; the same
  session saw a `db push` fail once with a TLS reset and succeed on retry. A
  local `supabase start` would remove the whole class of noise.
- **No end-to-end coverage past phase 1.** The unit and integration suites are
  thorough; the Playwright journey still only walks sign-up and house creation.
- **A dependent's chores now have a screen**, at `/chores/dependents`, linked
  from a guardian's own chore page: each dependent in their care, today's work
  first, with a "Meera did it" button per chore. Confirming is still refused —
  to the guardian by the card and to anybody by the database (migration 039).
- **No real device has received a push.** The bytes are proved right —
  `supabase/functions/_shared/webpush_test.ts` plays the receiver and decrypts
  them — but the last hop, through FCM or Mozilla's push service to a phone, has
  not happened. Installing the app on an Android device and granting permission
  is the remaining test, and it needs a deployed origin: a service worker only
  registers over HTTPS or on localhost.
- **N-10 has a producer** as of migration 046: a row reaching `confirmed` with
  `retry_count > 0` is exactly a chore that was rejected and then redone, and
  the trigger now tells the house so. Like every other migration written today,
  it has not been pushed to any environment.
- **N-04 still has no producer**, and deliberately: it announces a chore an
  admin assigned directly, and the product has no admin-override path to raise
  it from. It is in the catalogue and fires the moment one exists.

- The analytics page shows spend trends, category ranking, budget status,
  paid-versus-fair-share and effort concentration. CSV export and the budget
  alert producer are both delivered and covered, contrary to what this line
  said before.
- `tests/e2e/` covers the phase-1 journey only. Expenses, close and chores have
  integration coverage but no browser-level journey.
- Edge Functions must be deployed manually (`npx supabase functions deploy …`).
  Until they are, the cron jobs fire into a 404. Every job is idempotent, so a
  late deployment catches up rather than losing work. All eight were deployed on
  2026-08-24; `weekly-digest` has changed since and is one deploy behind.
