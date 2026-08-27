# Implementation plan — specification 2.0

**Written:** 2026-08-27
**Source of truth:** `docs/07-ROADMAP.md` phases 10–15, `docs/04-DATABASE.md`
§2.1–3.1, `docs/05-API-SPEC.md` §0.5, `docs/14-GOVERNANCE-SPEC.md`,
`docs/15-FOOD-SPEC.md`, `DECISIONS.md` D-39…D-50.
**State it plans from:** `PROGRESS.md` — engineering phases 1–9 built, phase 9
not applied to any environment.

---

## 0. The finding that shapes this plan

The code is not wrong against the new documents. It is *incomplete* against them.

An audit of the 67 shipped route handlers, 46 applied migrations, and the 22 unit
and 8 integration suites against the 2.0 document set found **no place where
shipped behaviour contradicts a 2.0 specification**. Version 2.0 is additive
across almost all of its surface: sixteen new tables, twelve new enum types, six
new API sections, and six new screens' worth of navigation.

Exactly **four** shipped things change in place. Everything else in this plan is
new construction. That distinction matters, because it means there is no "rewire
the app" phase — there is a short list of in-place edits, each belonging inside
the new phase that needs it, and a long list of additions that follow the
roadmap's order.

### The four in-place changes

| # | What changes | Where it lives today | Phase | Risk |
|---|---|---|---|---|
| R-1 | `member_status` value `pending` → `requested`; `member_role` gains `co_admin`; `role` becomes null while requested | `20260823090001_enums.sql`, plus every policy, function and constraint naming the string | 10 | **High** — silent to `select` |
| R-2 | Admin-creates-member paths deleted; joining becomes invite link → request → accept | `POST /api/houses/join`, `POST /api/houses/current/invite-code`, `lib/data/house.ts`, seed data, test fixtures | 10 | Medium |
| R-3 | Close, reopen, member removal and chore confirmation move behind decisions; their routes become *proposers* returning `409 DECISION_REQUIRED`, not 404s | `app/api/periods/[period]/close`, `.../reopen`, `app/api/members/[id]`, `app/api/chores/[id]/confirm` | 11 | **High** — changes shipped semantics |
| R-4 | Five-tab nav and `/dashboard` retire in favour of six destinations plus Today and Calendar; `/analytics` retires behind `/insights` aliases | `components/layout/nav.tsx`, `app/(app)/dashboard`, `app/(app)/analytics`, `app/api/analytics/*` | 14, 15 | Low — mechanical, redirects cover it |

Everything else — governance, rules, food, Today, Calendar, Insights,
multi-Home, reserves, expected contributions, planned meals — is new code beside
existing code.

---

## 1. Sequencing, and why it is not negotiable

The roadmap's order is load-bearing, and `PROGRESS.md` says why:

> membership before governance, because a decision needs participants and
> participants need roles; and governance before rules, food's navigation slot
> and the Approvals surface, because retrofitting a decision engine under four
> features that each grew their own approval flow is precisely the outcome the
> engine exists to prevent.

So: **10 → 11 → 12 → 13 → 14 → 15**, with one preliminary phase inserted ahead
of all of them.

### Phase 9.5 — close the environment gap (do this first)

Phase 9 is built and unapplied. Building phase 10 on top of an unapplied
migration 045 means the next six phases inherit a drift between
`lib/types/supabase.ts` and the live database, and
`tests/integration/llm-credentials.test.ts` keeps skipping itself — six lost
assertions on RLS, in the exact area (per-Home secrets) that phase 11 is about
to lean on.

Tasks, in order:

1. Confirm the target Supabase project. **This is a state-changing operation on
   a real environment — name the project explicitly before running anything.**
2. `npm run gen:llmkey`; put the value in `.env.local` and in
   `npx supabase secrets set LLM_KEY_ENCRYPTION_KEY=…`.
3. `npm run db:push` — applies 045 and 046.
4. `npm run gen:types`; confirm the hand-written aliases at the foot of
   `lib/types/supabase.ts` survived (the D-26 regression).
5. `npx supabase functions deploy weekly-digest` — it is one deploy behind since
   it learnt to ask a model for prose.
6. `npm run test` — the six `llm-credentials` tests must now **run**, not skip.

**Exit gate:** zero skipped tests attributable to schema state, and
`npm run typecheck && npm run lint && npm run test && npm run build` clean.

---

## 2. Cross-cutting work, decided once

These four decisions apply across phases 10–15. Settling them now stops each
phase inventing its own answer.

### 2.1 The `'pending'` grep is noisier than the docs imply

`docs/04-DATABASE.md` §3.1 prescribes
`grep -rn "'pending'" supabase/migrations lib/ app/`. That grep currently returns
twelve files, and **most of the hits are not `member_status`**: `swap_status` has
a `pending`, `settlement_status` has a `pending`, and `expense_status` has
`pending_approval`. Renaming those by mistake breaks settlement and swaps
silently.

Rule for phase 10: every hit is classified by which enum it belongs to before a
single one is edited, and the classification goes in the migration's header
comment. The migration is reviewed against that list, not against the raw grep.

### 2.2 `is_house_lead()` lands with the enum, not with governance

`is_house_member()` and `is_house_admin()` exist in
`20260823090011_rls_policies.sql`. `is_house_lead()` — admin **or** co_admin — is
required by phase 10's own acceptance criteria and by every governance policy
after it. It ships alongside the `co_admin` enum value so that no policy written
in phases 11–15 has to be back-patched.

Note the ordering hazard: Postgres will not let a transaction reference an enum
value added by `alter type … add value` in that same transaction. The enum
addition and the `is_house_lead()` definition are therefore two migration files,
047 and 048, not one.

### 2.3 Home context moves server-side before anything reads it

`docs/05-API-SPEC.md` §1: the Home is *"derived from the caller's selected Home,
held server-side in the session, never taken from a request body."* Today there
is one Home per user and every route resolves it implicitly. Phase 10 introduces
the selector; every route handler written from phase 10 onward reads through a
single `getSelectedHouse()` accessor in `lib/infra/supabase/`, and the existing
67 handlers are migrated onto it **in phase 10**, not later. This is mechanical,
it is large, and it is cheaper here than at any later point.

### 2.4 The governance property is a test before it is a feature

`DECISIONS.md` and `PROGRESS.md` both name the property version 2.0 exists for:

> In a Home of two or more people, no single member's responses can complete a
> Critical decision.

Following the repo's habit of property tests over `fast-check`, the randomised
property test for this is written **before** `apply_decision` exists, watched to
fail, and only then made to pass. It is the same class of invariant as
`Σ splits = amount` and `Σ final_net = 0`, and it fails the same way — silently,
while looking like a working feature.

---

## 3. Phase-by-phase plan

Migration numbers below are a proposed allocation from 047. The exact split is a
build-time call; what matters is the grouping, because each group is one
reviewable unit.

### Phase 10 — Membership and Homes

**Migrations**

| # | Contents |
|---|---|
| 047 | `alter type member_role add value 'co_admin'`; `alter type member_status rename value 'pending' to 'requested'`; restate every policy, function and check constraint naming the old string (classified per §2.1) |
| 048 | `is_house_lead()`; the Admin/Co-Admin policies that use it; the `role is null ⟺ status = 'requested'` check constraint in both directions (HM-07) |
| 049 | `invitations` and `join_requests` with RLS; `houses.home_type` as an enum column; the location columns (`country_code`, `state`, `city`, `area`) |
| 050 | `inactive` with `pending_settlement`, and the daily `complete-pending-removals` job that finishes a removal once the member is financially clear (D-45) |

**Application**

- `lib/data/homes.ts` — the caller's Homes, the selected Home, switching.
- `lib/infra/supabase/selected-house.ts` — the single accessor from §2.3.
- Routes: `GET /api/homes`, `POST /api/homes/select`, `POST /api/invitations`,
  `POST /api/invitations/rotate`, `GET /api/join/:token`,
  `POST /api/join/:token/request`, `GET /api/join-requests`,
  `POST /api/join-requests/:id/accept`, `POST /api/join-requests/:id/decline`.
- **Delete** `POST /api/houses/join` and `POST /api/houses/current/invite-code`
  — `docs/05-API-SPEC.md` §0.5 names phase 10 as their removal phase.
- **Delete** every admin-creates-member path, including from seed data and test
  fixtures. The guardian-creates-dependent path stays and is the documented
  exception.
- Screens: `/join/[token]` as the public landing page, `/homes` for the My Homes
  cards, the Home switcher in the shell, and a requests queue on
  `/house/members`.
- `/onboarding/pending` already exists and becomes the requested state's home.

**Test gates**

- The RLS loop: a `requested` person gets **zero rows from every table in their
  own Home**, iterated over the table list rather than asserted table by table.
- Setting a role on a `requested` row is refused by the database.
- A person in three Homes; their role in one has no effect in another.
- Rotating an invite link invalidates the old one and touches no existing
  membership or open request.
- Removal with money outstanding leaves the member `inactive` and flagged, keeps
  them in the settlement, and completes automatically when the last payment is
  confirmed.
- Every previously-`'pending'` test passes against `'requested'`.
- HM-20: a new Home is usable before it is configured.

---

### Phase 11 — Governance

The phase that changes what the product is. Build it slowly; it is the one to
split into the most commits.

**Migrations**

| # | Contents |
|---|---|
| 051 | `governance_policy`, `decisions`, `decision_participants`, `decision_responses`, and their RLS — with no update policy on responses at all, because a response cannot be revised |
| 052 | `apply_decision` as `security definer`, with `execute` revoked from `public`, `anon` and `authenticated`; one effect dispatcher per decision type |
| 053 | `chore_confirmations`; the quorum snapshot on "done"; the completion trigger; `confirmation_policy` on the Home |
| 054 | `absence_requests`, the preview, and the approve/reject effects |
| 055 | `balance_adjustments`; close and reopen become decisions (R-3) |
| 056 | `chore_assignment_shares` — shared assignment with exact point division (CE-11) |
| 057 | `member_expected_contributions`, `reserves`, `reserve_movements` (EX-13, EX-14) |
| 058 | The three governance cron jobs — expire, remind, complete-pending-removals — and N-40…N-46 in the notification catalogue |

**Domain — `lib/domain/governance/`, framework- and database-free**

- `resolve.ts` — the pure resolver: responses in, status out.
- `participants.ts` — the participant selector, one case per decision type, all
  cases in one file so the differences are visible side by side (D-40).
- `matrix.ts` — the default level matrix from `docs/14-GOVERNANCE-SPEC.md`.
- Property tests over randomised Home sizes, role distributions and policies.

**Application**

- Routes: `POST /api/decisions`, `GET /api/decisions`, `GET /api/decisions/:id`,
  `POST /api/decisions/:id/respond`, `POST /api/decisions/:id/cancel`,
  `GET /api/approvals`, `POST /api/approvals/approve-all`, `POST /api/absences`,
  `POST /api/absences/:id/preview`.
- The R-3 rewrite: `periods/[period]/close`, `.../reopen`, `members/[id]` DELETE
  and `chores/[id]/confirm` become proposers. An un-updated client gets
  `409 DECISION_REQUIRED` carrying the created decision's id, **never a 404**.
- Screens: `/approvals` with its aggregated queue and Approve All,
  `/decisions/[id]`, and the absence request flow on `/house/away`.

**Test gates** — the acceptance list in `docs/07-ROADMAP.md` phase 11 is long,
and every line of it is a test. The load-bearing ones:

- The Critical-decision property from §2.4, property-tested over randomised
  Homes.
- `apply_decision` called **with the service-role key** refuses a non-approved
  decision, and refuses one missing a mandatory response. Attack it with the key
  that bypasses RLS, because that is the threat D-42 names.
- The subject of a decision is never one of its participants.
- A nine-character rejection reason is refused; ten characters resolves the
  decision immediately.
- Approve All skips a Critical decision that would have completed on the
  caller's tap, and names why.
- A four-person Home's chore needs a lead plus one other; three ordinary members
  confirming does not confirm it.
- The quorum snapshotted at "done" does not move when somebody joins mid-window.
- `Σ final_net = 0` still holds with adjustments in the close.
- A 25-point chore shared three ways divides 8 / 8 / 9 and sums back to 25.
- `Σ variance(m) + reserve_balance = 0`, property-tested.
- A draw larger than the reserve balance is refused **at proposal time**, so the
  Home is never asked to approve a decision that cannot apply.

**The one to watch:** this phase can make the product unusable if the levels are
set too high. Ship the documented defaults, and ship Approve All in the same
release as the decisions themselves — not a version later.

---

### Phase 12 — Rules

**Migrations:** 059 — `home_rules`, `home_rule_versions`, and the activation
constraint, so that a row with `activated_at` set and no `decision_id` is refused
by the database.

**Application**

- The structured-rule form, which must work with **no AI configured at all**.
  Rules are not an AI feature; AI is a shortcut into the same form (D-46).
- `POST /api/rules/parse` — the fourth LLM call site, per `docs/10-LLM-SPEC.md`
  v3.0. It returns a proposal and stores nothing.
- Submission, editing and disabling as `change_rule` decisions through phase 11's
  engine.
- `/house/rules` — the list, with per-rule Edit, Disable and History.
- The two executed kinds: `chore_missed → reschedule`, and a weight or penalty
  feeding the effort and settlement engines.

**Test gates:** editing an active rule creates version 2 and leaves version 1
readable with its original dates and values; the history answers who, when, from
what, to what, why and who acknowledged; a rule with a penalty weight affects a
settlement only after activation, and the effect appears in that month's close.

---

### Phase 13 — Food

**Migrations:** 060 — `foods`, `meals`, `meal_items`, `meal_participants`,
`food_preferences`, and the per-person cost trigger, deferred the way migration
043's fix is; 061 — `meal_plans` and the optional two-way expense link, with
**no cascade** in either direction.

**Application**

- Add Meal in the order of `docs/15-FOOD-SPEC.md` §8.1: name, participants,
  source, cost, then everything optional. A meal with only a name and a date
  saves.
- Library matching and the did-you-mean panel; merge restricted to leads.
- `lib/domain/food/recommend.ts` — the deterministic recommender, its reasons
  and its cold-start message.
- AI food ideas as the fifth call site, with the full validation contract. When
  it fails, the AI half **disappears** and the library half still renders, with
  no error anywhere (D-48).
- Planned meals (FD-20): a planned meal creates no cost, no expense, no
  participants and no preference signal, and appears in no food history, Insights
  view or recommender input until a member confirms it was eaten.

**Test gates:** ₹180 across three participants is ₹60 each exactly, and a total
that does not divide still sums back to the total; four spellings of one dish
offer a match rather than creating four entries, and nothing merges without a
person confirming; a member who dislikes an ingredient is never shown a meal
containing it, while the Home's own ranking of that meal is unchanged; the same
data always produces the same two suggestions in the same order; voiding an
expense linked to a meal leaves the meal intact, and deleting a meal leaves the
expense intact.

**The guard rail:** *adding an expense never opens a food form.* The ten-second
expense entry flow is measured again at the end of this phase.

---

### Phase 14 — Today, Calendar and navigation

This is where R-4 lands.

**Application**

- `components/layout/nav.tsx` — six destinations: Home, Today, Chores, Money,
  Food, Insights. The More menu. The rule that promotes Approvals into primary
  navigation with its count the moment anything is pending, and removes it when
  nothing is.
- `/today` — presence, chores, money, food and its suggestions, and what is
  waiting on the caller. It must answer "what is happening now" without
  scrolling at 360 px.
- `/` — the Home overview, in its three role shapes.
- `/calendar` — day, week and month, composed from the other modules. The day
  view returns presence, chores, money, food and pending decisions **in one
  request**.
- The universal quick-add, offering exactly the actions the caller is permitted.
- Retire `/dashboard` behind a redirect. Retire the five-item bar.
- One-action Done (CE-12) from Today and from the schedule: nothing is required
  before the tap, and the photo, note and any confirmation step open after it.
- The last-completed figure (CH-12) on every template — "never completed" rather
  than a creation date or an empty cell, and a completion still inside its
  confirmation window shows as pending rather than as the last-completed.

**Test gates:** every primary destination is one tap from every other; no screen
in the app is reachable only from a URL; and Playwright journeys — this is the
phase where end-to-end coverage past phase 1 finally becomes cheap, because
there is a navigation skeleton to walk.

---

### Phase 15 — Insights

**Application**

- `GET /api/insights` with its type, period, category and person filters, and the
  four types: money, chores, food, home.
- `GET /api/insights/budgets` and `GET /api/insights/export`.
- `/insights` — one filtered screen. No page-per-report anywhere.
- Alias `/analytics` and the five `/api/analytics/*` routes through the
  transition rather than deleting them on the day Insights ships
  (`docs/05-API-SPEC.md` §0.5).
- IN-09, the household financial position — derived from the settlement
  arithmetic, **not reimplemented**. The position view's "paid minus fair share"
  must equal the settlement's `expense_net` for every member, from the same
  calculator.
- IN-10 permanent export: CSV of every view, a full-history export of the Home's
  records, and the PDF settlement statement. No tier, no cap, no waiting period,
  and **no feature gate on the export routes**.
- EF-12 point explainability: every points figure opens to the dated records
  that sum exactly to it, and a zero is explained as readily as a total.
- Family Homes present chore data as contribution, never as a competitive
  ranking.

**Reuse, not rewrite:** `lib/domain/analytics/csv.ts` already carries RFC 4180
quoting, CRLF endings and the formula-injection guard, all property-tested. The
Insights export uses it unchanged.

---

## 4. Working method

- **One branch per phase**, off `master`, merged when its acceptance table is
  green. Phases are weeks of work; a single long-lived branch across all six is
  how the enum rename and the navigation rewrite end up in the same conflicted
  diff.
- **Atomic commits inside a phase**, one per migration group or per domain
  module, so that `git bisect` still means something when the governance
  resolver regresses.
- **Checks proportionate to the change**, per `AGENTS.md`: `npm run typecheck`,
  `npm run lint`, `npm run test`, `npm run build`; `npm run test:functions` for
  Edge Function or Web Push work; `npm run test:e2e` for browser journeys.
- **Migrations are state-changing.** Confirm the target environment before every
  `db:push`. Integration tests create and remove real users, so run them against
  a local or scratch project, never production.
- **Update `PROGRESS.md` at the end of every phase** with what was delivered,
  what each acceptance criterion is proved by, and what was found and fixed on
  the way. That file is the state; this file is the plan.
- **New decisions go in `DECISIONS.md`** as D-51 onward, not in commit messages.

---

## 5. Risks, ranked

| # | Risk | Mitigation |
|---|---|---|
| 1 | The enum rename silently misses a hit, or renames the wrong enum's `pending` | §2.1 — classify every grep hit by enum before editing one, and keep the classification in the migration header |
| 2 | Governance levels ship too strict and the Home stops using the app | Documented defaults only, with Approve All in the same release as decisions |
| 3 | The Critical-decision property passes by construction rather than by proof | Write the property test first, watch it fail, then attack `apply_decision` with the service-role key |
| 4 | R-3 breaks a client that has not been updated | Proposers return `409 DECISION_REQUIRED` with the decision id; never a 404 |
| 5 | Six phases of new tables land while integration tests still run against the live remote project, so a dropped connection reads as a defect | Stand up `supabase start` locally before phase 11; `PROGRESS.md` already names this noise, seen on 2026-08-24 |
| 6 | The selected-Home migration of 67 existing handlers is deferred past phase 10 and then has to be done underneath six phases of new code | §2.3 — it happens in phase 10 or not at all |
| 7 | Food's Add Meal flow leaks into expense entry | The ten-second expense flow is re-measured at the end of phase 13 |
| 8 | Phase 9's environment gap compounds into schema drift between the generated types and the live database | Phase 9.5 runs first |

---

## 6. What this plan does not cover

- **Phase 15+ post-v2 extensions** — the shopping list, multi-currency and
  recipe instructions are version-2 non-goals per `docs/01-BRD.md` §4.2 and §11.
- **Phase 16+ offline mutation queue.**
- **Phase 17 native Android and iOS** — product phase 2, and explicitly not a
  zero-code wrapper. Native push uses a provider adapter and a platform token
  lifecycle; browser Web Push and VAPID are not reusable as native transport.
  Read the phase-17 section of `docs/07-ROADMAP.md` before starting it.
- **The product phase 1 launch gate** — privacy and support pages, monitoring,
  backups, a real-device web smoke test, and the first real push ever received by
  a browser. Specification 2.0 widens what phase 1 contains; it does not change
  that gate.
