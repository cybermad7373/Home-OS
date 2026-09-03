# 02 — Technical Requirements Document

**Product:** HouseOS
**Version:** 2.0
**Date:** 2026-08-26
**Depends on:** [01-BRD.md](01-BRD.md) v2.0

---

## 0. Product delivery phases

This technical document covers the shared backend and the web/PWA product
phase first. Native Android and iOS clients are a second product phase and must
consume the versioned API and shared domain rules rather than duplicate
business logic in the clients.

## 1. Purpose

This document translates the business requirements into technical obligations: what must be built, on what, to what standard, and within what limits. It does not describe *how the code is organised* — that is [03-ARCHITECTURE.md](03-ARCHITECTURE.md) — nor the exact logic of the fairness and settlement engines, which is [06-ALGORITHMS.md](06-ALGORITHMS.md).

---

## 2. Technology stack

Every component below has a permanently free tier sufficient for a house of 8–30 members.

| Layer | Choice | Version | Why this one |
|-------|--------|---------|--------------|
| Frontend framework | Next.js (App Router) | 16.3.2 | One framework serves the UI, the API routes and the server-rendered pages. The web app is the first product deliverable and owns the browser/PWA experience. |
| Language | TypeScript | 5.x | Strict mode. The domain has enough enumerated states (chore status, period status, split basis) that type safety pays for itself immediately. |
| Styling | Tailwind CSS + shadcn/ui | 4.x / latest | Responsive by construction, dark mode built in, component primitives that look good without a designer. |
| Charts | Not installed in the current web build | — | Analytics is partly planned; do not document Recharts as an installed dependency until it is added and used. |
| Database | Supabase Postgres | 15+ | Free tier: 500 MB, unlimited API requests. Real Postgres — the settlement and fairness logic needs window functions and transactions. |
| Authentication | Supabase Auth | current | Email/password plus Google OAuth. Issues JWTs the database itself validates. |
| Authorisation | Postgres Row Level Security | — | House isolation enforced in the database, not in application code. A bug in a route handler cannot leak another house's data. |
| File storage | Supabase Storage | — | Receipt images and chore photos. 1 GB free. |
| Scheduled jobs | `pg_cron` + Supabase Edge Functions | — | Deno runtime. Weekly generation, nightly auto-confirm, recurring posting, digests, reminder dispatch. |
| Web push notifications | Web Push (VAPID) | — | Browser/PWA transport for product phase 1. Native push is a separate adapter in product phase 2. |
| LLM | AI Router over a provider-agnostic adapter; nine providers as data rows over three transports | — | The key belongs to the Home and is supplied by its Admin (D-35). Adding a provider must not touch a call site (D-36). |
| Hosting | Vercel Hobby | — | Free. Non-commercial use only, which fits. |
| Native clients (later phase) | To be selected during mobile discovery | — | Android/iOS clients reuse the stable API and domain contracts. The native stack and push providers are not installed or committed yet. |

### 2.1 Why the PWA comes before the native app

Building both at once doubles the surface area before a single behaviour has
been proven with real users. The installed PWA already provides a home-screen
icon, offline reads and browser push on supported platforms at low cost. The
native phase follows a stable web/API release and consumes the same API, but it
will require backend work for native push token registration, deep links,
platform capabilities and operational telemetry.

### 2.2 Free-tier limits and how each is respected

| Limit | Value | Impact | Mitigation |
|-------|-------|--------|------------|
| Supabase database | 500 MB | Never approached. The entire data set for a house for a year is a few tens of MB. | Receipt images live in Storage, not the database. |
| Supabase project pause | Pauses after 7 days with no activity | Would take the app offline | A weekly `pg_cron` heartbeat plus daily jobs keep it active permanently. |
| Supabase Storage | 1 GB | About 4,000 compressed receipt photos | Client compresses images to a 1280 px longest edge before upload; photos older than 12 months are pruned by a monthly job. |
| Vercel Hobby | Non-commercial, 100 GB bandwidth | Not approached at this scale | — |
| Vercel Cron on Hobby | Limited frequency | Insufficient for hourly reminders | All scheduling runs on `pg_cron` inside Supabase instead. |
| Edge Function invocations | 500,000 per month free | Not approached | — |
| LLM free tier | Provider-dependent | Rate limits could fail a digest | LLM calls are asynchronous and non-blocking; a failure degrades to the deterministic path and is logged. |

---

## 3. Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Performance | First contentful paint under 2 seconds on a 4G connection. Interactive under 3 seconds. |
| NFR-02 | Performance | Any list view (expenses, assignments) returns its first page within 500 ms at p95. |
| NFR-03 | Performance | Weekly schedule generation for 30 members and 200 chore instances completes in under 5 seconds. |
| NFR-04 | Responsiveness | Every screen is usable at 360 px width. Mobile is the primary target; desktop is a widened layout, not a separate design. |
| NFR-05 | Offline | The service worker provides read-only cached/offline shell behaviour. Offline mutations fail honestly in the current build; a future write queue must meet the contract in section 8.1 of [03-ARCHITECTURE.md](03-ARCHITECTURE.md) before being enabled. |
| NFR-06 | Accessibility | WCAG 2.1 AA contrast. Every interactive element reachable by keyboard. Every form input labelled. |
| NFR-07 | Availability | Best effort. This is a household tool; there is no uptime commitment. Scheduled jobs must be idempotent so that a missed run can be re-run safely. |
| NFR-08 | Data integrity | Every monetary calculation is exact. Amounts are stored in integer paise, never floating point. Every split must sum exactly to its expense amount. |
| NFR-09 | Auditability | Every state change to an expense, assignment, settlement or house setting writes an activity log row with actor, before-state and after-state. |
| NFR-10 | Timezone | All timestamps stored as `timestamptz` in UTC. All date logic (which day a chore belongs to, which month an expense falls in) evaluated in the house's timezone. |
| NFR-11 | Idempotency | Every scheduled job and every settlement action is idempotent. Running the weekly generator twice for the same week must not create duplicate assignments. |
| NFR-12 | Localisation | Version 1 is English and INR only, but no currency symbol or date format is hard-coded in a component. |
| NFR-13 | Maintainability | A single developer must be able to hold any one module in their head. No file exceeds roughly 300 lines; business logic lives in `lib/`, never in components. |
| NFR-14 | Testability | The fairness engine, split calculator, netting algorithm, decision resolver, confirmation-quorum calculator and food recommender are pure functions with no database dependency, unit tested in isolation. |
| NFR-15 | Determinism | Every ranking the product shows a person — the effort standing, the settlement payment list, the two library food suggestions — is produced by a deterministic function. The same stored data always renders the same order. A ranking that changes without the data changing is a defect. |
| NFR-16 | Explainability | Any suggestion or automatic allocation the product makes can state its reasons from stored data: why this member got this chore, why this meal is suggested, why this settlement payment exists. |
| NFR-17 | Decision latency | Recording a response to a decision, and the resolution that may follow it, completes within 500 ms at p95. A governance flow that feels slow is a governance flow people route around. |
| NFR-18 | Unmetered recording | No product-level quota, daily cap, waiting period or paid tier gates the recording of an expense, a chore completion, an absence or a meal. The abuse limits of SEC-10 are sized so that normal household use never reaches them; a limit a real member can hit during ordinary use is a defect, not a tier. Carries BRD commitment CM-1. |
| NFR-19 | Permanent portability | CSV export of every Insights view, a full-history export of the Home's records, and a PDF settlement statement are permanent capabilities. Removing, restricting or metering an export path is a breaking change requiring the same review as removing a requirement. Carries BRD commitment CM-3 and requirement IN-10. |
| NFR-20 | Durable writes | The interface reports a record as saved only after the server has confirmed the write. A failed or unreachable write surfaces as a visible failure with the entered values preserved and retryable — never as a success, and never as a silent discard. Applies to expenses, chore completions, meals, absences and decision responses. Carries BRD commitment CM-4. |
| NFR-21 | Latency budget | The p95 figures of NFR-02 and NFR-17 are the two that were measured; this is the budget for everything else. A read returns within **500 ms at p95 and 1.5 s at p99**; a write within **800 ms at p95 and 2 s at p99**; the four batch paths — weekly generation, month close, insights over a full year, export — are exempt and carry their own bounds (NFR-03, NFR-22). Measured at the route handler, for a Home of 30 members with two years of history. |
| NFR-22 | Bounded work | Every request does work bounded by the Home, never by the deployment, and no path's cost depends on a search that might not terminate. **The schedule solver is a single greedy pass over chore instances**, scoring each candidate member once — O(instances × members), with no backtracking and therefore no worst case distinct from its typical case. That is why NFR-03's 5-second bound is a statement about size rather than about luck, and it is a property to preserve: replacing the greedy pass with a search would require an explicit iteration and wall-clock cap, and a defined answer for what is returned on hitting it. A month close is O(members × expenses in the period); insights and export stream rather than materialise. |

---

## 4. Security requirements

| ID | Requirement |
|----|-------------|
| SEC-01 | Every table containing house data has Row Level Security enabled with a policy requiring the requesting user to be an active member of that house. There are no exceptions and no tables with RLS disabled. |
| SEC-02 | The Supabase service-role key exists only in Edge Function environment variables and Vercel server-side environment variables. It is never present in any client bundle. |
| SEC-03 | Admin-only mutations are enforced twice: in the route handler and by an RLS policy checking the member's role. Client-side hiding of admin UI is presentation, not security. |
| SEC-04 | A member cannot confirm their own chore or approve their own expense. Enforced by a database check constraint, not only by application logic. |
| SEC-05 | Uploaded files are restricted by MIME type and to a maximum of 5 MB. Storage bucket policies scope every object path to its house. |
| SEC-06 | The LLM adapter sends only member identifiers, first names, effort numbers and chore metadata. Sending an email address, phone number, UPI identifier or full name is a defect. |
| SEC-07 | The LLM API key is server-side only. No LLM call originates from the browser. |
| SEC-08 | Invite codes are single-house, rotatable by the admin, and joining always requires admin approval — possession of a code alone never grants access. |
| SEC-09 | All secrets are supplied through environment variables. The repository contains only a `.env.example` with empty values. |
| SEC-10 | Rate limiting on expense creation, chore confirmation and LLM-backed endpoints, to bound both abuse and free-tier consumption. |
| SEC-11 | Closed periods are immutable at the database level. Writes to expenses in a `CLOSED` period are rejected by a trigger, not merely hidden in the UI. |
| SEC-12 | A decision's effect is applied only by a `security definer` function that refuses any decision not in `approved`, and refuses the transition when a mandatory participant has not responded. Approval and application are separate states and separate writes. |
| SEC-13 | The subject of a decision is never a permitted participant in it. A member does not vote on their own removal, a payer does not approve their own expense, an assignee does not confirm their own chore. Enforced by check constraint and by RLS on the response table, not only by a route handler. |
| SEC-14 | A `requested` membership grants no data access whatsoever. RLS treats any status other than `active` as a non-member for reads, so a pending or inactive person receives zero rows from every house-scoped table. |
| SEC-15 | An invite link carries no authority. It identifies a Home and lets a person raise a request; acceptance is what grants membership. Revoking a link never revokes an accepted membership, and possession of a link never yields data. |
| SEC-16 | A Home rule activates only through an approved decision. A row in `home_rule_versions` with `activated_at` set and `decision_id` null is a defect and is refused by a check constraint. |
| SEC-17 | AI has no write path to money, permissions, rules, approvals, chore allocation or settlement. Every model output enters the system as a proposal that a person confirms or a validator accepts. |
| SEC-18 | A Home's location is used as suggestion context only. It is never sent to a third party other than the Home's own configured LLM provider, and never with anything that identifies the Home or a person. |

---

## 5. Integration requirements

### 5.1 Web Push (web/PWA only)

- VAPID key pair generated once and stored in environment variables.
- A subscription is stored per member per device. Expired subscriptions (HTTP 410 from the push service) are deleted on the next send.
- Payloads carry a type, a title, a body and a deep link. No sensitive amounts appear in the notification body beyond what the member is entitled to see.

### 5.2 Device notification contract

- One row per device per member, with a provider-neutral transport and token
  payload. The current web implementation stores the Web Push endpoint and
  encryption keys. Native implementations will store their provider/token
  metadata through the same server contract.
- `platform` names the device (`web`, `android`, `ios`); it does not imply that
  all platforms use the same transport. The server-side dispatcher selects the
  adapter based on the registration's transport/provider.
- Settings lists every device with a label, a last-used time and a remove control. Push is the only channel that leaves the app, so this list is the whole of "where the house reaches me".

### 5.3 UPI deep links

- Format: `upi://pay?pa=<vpa>&pn=<payee name>&am=<amount>&cu=INR&tn=<note>`.
- Each member optionally stores a UPI VPA on their profile. Without one, the settlement still lists the payment, only without a tappable link.
- The application never confirms a payment automatically. Payment status is always a human assertion by the payer and the receiver.

### 5.4 LLM adapter

- One **AI Router** in front of one adapter interface, over three wire transports (`openai-chat`, `gemini`, `anthropic`). Providers are data rows, not classes (D-36).
- The provider, model and key belong to the Home and are stored encrypted (D-35). The environment variables are a single-house fallback.
- Every call is wrapped: a timeout of 20 seconds, one retry, structured JSON output requested, and a schema validation of the response.
- **Six call sites and nothing more**: schedule proposal, weekly digest, natural-language parse, rule parse, food ideas, meal-name normalisation. Each is individually switchable as a Home capability.
- **Validation is mandatory.** A schedule proposal that violates any hard constraint is discarded whole; there is no partial acceptance. A rule parse is a proposal a person edits. A food idea that duplicates the library, names a restaurant or contains a disliked item drops the whole AI half of the suggestion card. The deterministic result is used instead and the rejection is recorded.
- **No call site writes.** Every one of the six returns a proposal, a draft or a suggestion. The write is a person's tap or a validator's acceptance.

---

## 6. Data requirements

| ID | Requirement |
|----|-------------|
| DR-01 | Money is stored as `bigint` paise. Rupees exist only at the presentation boundary. |
| DR-02 | Effort points are stored as integers. Fractional points are not permitted. |
| DR-03 | Every domain enum is a Postgres enum type, not a free-text column. |
| DR-04 | Room occupancy is dated (`from_date`, `to_date`) so that a rent split for a past month uses that month's occupancy, not today's. |
| DR-05 | Membership is dated for the same reason: an expense split must reflect who was a member on the expense date. |
| DR-06 | Deletion is soft everywhere that history matters: members, expenses, assignments, rooms. Hard deletion is reserved for records with no financial or effort consequence. |
| DR-07 | Every table carries `created_at` and `updated_at` as `timestamptz`, maintained by trigger. |
| DR-08 | Foreign keys are enforced. No orphan rows. |
| DR-09 | A settlement is derived data, but it is materialised and stored, because it must remain exactly as computed at close even if underlying data is later corrected. |
| DR-10 | A decision stores both the change it proposes (`payload`) and the change it made (`result`). The two are written at different times and are not the same fact. |
| DR-11 | A rule's original text is stored verbatim and never rewritten, alongside its parsed structure. Every version is retained; editing appends, never overwrites. |
| DR-12 | A meal's total cost is stored, not derived on read, so a library entry's later cost changes cannot rewrite what a past meal cost. |
| DR-13 | A chore assignment snapshots the confirmation quorum it needs at the moment it is marked done. Membership changing afterwards does not move the requirement. |
| DR-14 | Food and money reference each other by nullable foreign key in both directions. Neither deletion cascades to the other. |

---

## 7. Scheduled jobs

All run on `pg_cron` inside Supabase, invoking Edge Functions. All are idempotent.

| Job | Schedule (house timezone) | What it does |
|-----|---------------------------|--------------|
| `generate-weekly-schedule` | Sunday 20:00 | Closes the effort ledger for the finishing week, computes next week's targets, generates and publishes assignments. |
| `dispatch-notifications` | Every 15 minutes | Sends push for everything due, to every device the member has registered, timed against their availability and quiet hours. |
| `auto-confirm-chores` | Every 30 minutes | Confirms chores marked done more than the configured window ago with no rejection, and posts their points. |
| `mark-missed-chores` | Daily 23:55 | Marks past-deadline assignments as missed. |
| `post-recurring-expenses` | Daily 06:00 | Posts any recurring expense due today. |
| `weekly-digest` | Sunday 21:00 | Composes and sends the house digest, including the LLM fairness summary when a key is configured. |
| `budget-alerts` | Daily 20:00 | Checks category spend against budgets and alerts on breach. |
| `prune-old-media` | Monthly | Deletes chore photos older than 12 months. Receipts are retained. |
| `expire-decisions` | Hourly | Moves any `waiting` decision past its deadline to `lapsed`, and notifies the participants who did not respond. |
| `remind-decisions` | Daily 19:00 | Reminds participants of any decision whose deadline is within 24 hours and whose response is still outstanding. |
| `complete-pending-removals` | Daily 07:00 | Re-checks every `Inactive` member flagged pending settlement and completes the removal when they are financially clear. |
| `refresh-food-suggestions` | Daily 16:00 | Recomputes the library half of each Home's suggestions so the Food and Today screens render without computing on request. |
| `heartbeat` | Weekly | A trivial query that keeps the free-tier project from pausing. |

The first three are governance infrastructure: a decision that can only be
resolved while somebody is looking at a screen is a decision that stalls. All
five are idempotent like every other job.

---

## 8. Environment configuration

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server and edge functions only

# Web Push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com

# LLM key sealing  (required only if any house stores its own provider key)
LLM_KEY_ENCRYPTION_KEY=             # 32 bytes base64; `npm run gen:llmkey`

# LLM fallback  (all optional — for a single-house self-host and for development.
# The ordinary path is a key the house admin enters during house creation.)
LLM_PROVIDER=gemini                 # any id in the provider registry
LLM_API_KEY=
LLM_MODEL=gemini-flash-lite-latest

# App
NEXT_PUBLIC_APP_URL=
```

A key is normally supplied per house, by its admin, during house creation, and stored sealed — see [10-LLM-SPEC.md](10-LLM-SPEC.md) sections 2 and 3. These variables are the fallback for a deployment that serves one house.

Absence of a key, in the environment and in the database alike, must not produce an error anywhere. It disables three features and nothing else. `LLM_KEY_ENCRYPTION_KEY` is needed only to store a house key; without it, saving one fails with a plain message and nothing is ever written in plaintext.

---

## 9. Testing requirements

| Layer | Approach | Coverage expectation |
|-------|----------|---------------------|
| Domain logic (`lib/`) | Vitest unit tests against pure functions | Every branch of the split calculator, the netting algorithm, the target calculator and the constraint validator. This is where correctness lives. |
| Database | SQL tests for RLS policies and triggers | Every policy proved to block a member of another house. Every immutability trigger proved to reject a write. |
| API routes | Integration tests against a local Supabase | Happy path plus authorisation failure for every endpoint. |
| UI | Playwright, on the critical journeys only | J3 (chore lifecycle), J4 (expense entry), J5 (month close). |

Three properties must hold and must be tested as such:

1. **Splits always sum to the expense amount**, for any member count and any rounding remainder.
2. **Settlement nets to zero.** The sum of all payments in, minus all payments out, is exactly zero across the house.
3. **A generated schedule never violates a hard constraint**, for any randomly generated availability configuration.

---

## 10. Out of technical scope for web product phase 1

- Real-time collaborative editing or live presence indicators.
- Native Android and iOS clients, FCM/APNs integration, store packaging and
  store release operations. These belong to product phase 2.
- The offline write queue itself. The contract it would have to meet — per-endpoint opt-in, idempotency keys, server-side re-validation rather than last-write-wins, a bounded retry and a needs-attention list — is written in section 8.1 of [03-ARCHITECTURE.md](03-ARCHITECTURE.md) so that it is designed against a contract when it is built. It is not built in version 2.
- Multi-currency and more than one timezone per Home in version 2. Per-expense currency with snapshotted conversion is specified for the post-v2 phase 15+ ([06-ALGORITHMS.md](06-ALGORITHMS.md) section 5.5, [09-BUSINESS-RULES.md](09-BUSINESS-RULES.md) section 1.14); more than one timezone per Home is not scheduled at all.
- SMS or email notification channels.
- Any analytics or telemetry service.
- Nutrition analysis or calorie tracking. The meal-item model is shaped so this is possible later; nothing computes it now.
- Pantry or grocery inventory in version 2. Meals reference items; stock is not modelled here. The shopping list that derives from meal plans is specified for the post-v2 phase 15+ ([15-FOOD-SPEC.md](15-FOOD-SPEC.md) section 13).
- Restaurant, menu or delivery integrations. Location is context for suggestions and never a claim about availability.
- Weighted voting, proxy voting or delegated authority in governance.
- A rules *execution* engine beyond the two structured kinds named in [14-GOVERNANCE-SPEC.md](14-GOVERNANCE-SPEC.md) section 6.3. Every other rule is text the Home agreed to and can point at.
