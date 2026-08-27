# 07 — Build Roadmap

**Product:** HouseOS
**Version:** 2.0
**Date:** 2026-08-27

## 0. Product delivery phases

The roadmap has two product phases. The numbered rows below are engineering
subphases used to build and verify them.

| Product phase | Engineering subphases | Release gate |
|---|---|---|
| 1 — Web/PWA | 1–15, then 15+ and 16+ (foundation through the Home OS additions, shopping list, gamification, and the offline queue) | Web app/PWA is production-ready, secure, backed up, monitored, documented, and verified with a real home and real-device smoke tests |
| 2 — Native mobile | 17 (mobile discovery/build/release; may be split into additional subphases) | Play Store and App Store builds pass real-device acceptance, native push and deep links work, and store operational requirements are complete |

### 0.1 Where the build has reached against this roadmap

Phases 1 to 9 were built against **specification 1.0** and are complete or
substantially complete — phase 9 is built but not yet applied to an environment — see [`../PROGRESS.md`](../PROGRESS.md). Phases 10 to 15
implement the **version-2.0** additions: shared governance, multi-Home and
request-to-join, rules, food, the calendar and the new navigation, and
cross-domain insights. Phase 15+ adds the shopping list, gamification layer,
and multi-currency rounding. Phase 16+ adds the offline mutation queue, and
phase 17 is the native-mobile product phase.

The renumbering is deliberate and one-way. Nothing in phases 1 to 9 is
discarded; version 2.0 extends that work rather than replacing it, and the
migration path for each changed behaviour is stated in the phase that changes it.

---

## 1. Sequencing principle

The build order is driven by one rule: **each phase must leave the app more useful than it was, to real members, in the real house.** No phase exists only to enable a later phase.

That produces a slightly counter-intuitive order. Expenses come before chores, even though chores are the product's centre of gravity, for three reasons:

1. Expense tracking is immediately useful with zero configuration. Chores need templates, point weights and availability before they produce anything.
2. It builds the money primitives — periods, splits, netting, exact-sum arithmetic — that the chore penalty mechanism depends on later.
3. It gets all 8 members into the app and habituated before the schedule starts making demands of them. Introducing the app *with* a chore assignment attached is the fastest way to have it ignored.

Phases 1 through 5 constitute the minimum viable house. Everything after is amplification.

---

## 2. Phase overview

| Phase | Name | Delivers | Requirements | Estimate |
|-------|------|----------|--------------|----------|
| 1 | Foundation | Auth, house, members, rooms | HM-01…08 | 1 week |
| 2 | Expense ledger | Logging, splitting, approvals, recurring | EX-01…09 | 1.5 weeks |
| 3 | Month close | Periods, penalties-ready settlement, UPI links | ST-01…08 | 1 week |
| 4 | Chore engine | Templates, generation, lifecycle, effort ledger | CH-01…11, CE-01…09, EF-01…03, EF-06 | 2 weeks |
| 5 | Availability and guests | Windows, exceptions, guests, penalty wiring | AV-01…06, AV-09, EF-04, EF-05, CE-09, EX-06 | 1.5 weeks |
| 6 | Household shapes | Shared and family Homes, money and effort modes, dependents, daily running cost, the Home's own categories | HM-02, HM-16, CE-10 | 1.5 weeks |
| 7 | Notifications | Push, escalation, digest, devices | NT-01…06, NT-08 | 1 week |
| 8 | Analytics | Spend, effort, budgets, export — superseded by Insights in 2.0 | AN-01…06 (1.0 IDs, superseded by IN-01…10) | 1 week |
| 9 | Intelligence | LLM digest, LLM scheduling, natural-language entry | AI-01…05, AI-10…12 | 1 week |
| **10** | **Membership and Homes** | Multi-Home, invite links, request-to-join, Requested state, Co-Admin, Inactive, conservative first-week seeding | HM-01…20 | 1.5 weeks |
| **11** | **Governance** | The Decision engine, the Approval engine, the Approvals surface, size-aware confirmation quorum, shared chore assignment, absence requests, governed close/reopen/removal/adjustment, expected contribution and the reserve | GV-01…12, AP-01…06, CE-02…03, CE-11, AV-04…08, ST-02, ST-08, EX-12, EX-13, EX-14, EF-07 | 3 weeks |
| **12** | **Rules** | Plain-text rules, AI parsing to a proposal, individual editing, versioning, history | RL-01…10 | 1 week |
| **13** | **Food** | Meals, items, sources, costs, participants, the library, preferences, both recommendation paths, planned meals | FD-01…20 | 2 weeks |
| **14** | **Today, Calendar and navigation** | The Today screen, the Calendar, the six-item primary navigation, the More menu, the universal quick-add, one-action Done, the last-completed figure | CL-01…05, DB-01…06, CH-12, CE-12 | 1.5 weeks |
| **15** | **Insights** | One filtered screen over money, chores, food and the Home; the household financial position; permanent export; point explainability | IN-01…10, EF-12 | 1.5 weeks |
| **15+** | **Post-v2 extensions** | Shopping list derived from meal plans and pantry, multi-currency split rounding, recipe instructions in meals, announcements, chatbot complaints feed, gamification layer | DB-07, EF-08…11; shopping list, multi-currency and recipe instructions carry no BRD requirement ID — they are version-2 non-goals specified in 09-BUSINESS-RULES §1.13–1.14 and 15-FOOD-SPEC §11–12 | 1 week |
| **16+** | **Offline Mutation Queue** | Local-first mutation queue, optimistic UI, sync with conflict detection, offline indicators | — | 1.5 weeks |
| 17 | Native mobile clients (product phase 2) | Native Android/iOS clients, provider-neutral push adapter, camera/uploads, deep links and store release | — | estimate after mobile discovery |

Phases 1 to 9 were roughly twelve and a half weeks of part-time work. Phases 10 to 15 add
about ten and a half more — one week above the original estimate, absorbed by the
requirements the competitive analysis added to phases 11 and 15.

**The sequencing rule that produced this order.** Governance is phase 11 and not
phase 14, even though it is the least immediately visible work, because
everything after it depends on it: rules activate through decisions, food does
not, but the Approvals surface in the navigation of phase 14 is empty until
decisions exist, and retrofitting the Decision engine underneath four features
that each grew their own approval flow is exactly the outcome the engine exists
to prevent.

Membership comes first, at phase 10, for the same reason in miniature: a
decision needs participants, participants need roles, and Co-Admin does not
exist until membership is rebuilt.

---

## 3. Phase detail

### Phase 1 — Foundation

**Goal:** every member can log in and see their house, its rooms and its people.

**Scope**
- Supabase project, migrations for section 4.1 of the database document, RLS policies and their tests
- Email/password and Google sign-in
- House creation with an invite code; join and admin approval flow (**replaced in phase 10** by an invite link and request-to-join)
- Member management: role, status, residency, cooking flag
- Room management and dated room assignment
- House settings screen
- App shell: navigation, layout, theme, PWA manifest and service worker registration

**Acceptance**
- An admin creates a house, and seven members join by code and are approved
- Every member sees the house, its rooms and who lives in each
- A member of house A receives zero rows from house B for every table — proved by test, not by inspection
- The app installs to an Android home screen and opens offline to a shell

**Out of scope:** any chore or expense functionality.

---

### Phase 2 — Expense ledger

**Goal:** the house stops tracking money on paper. This phase alone is worth deploying.

**Scope**
- Expense categories with budgets
- Expense creation in under ten seconds: amount, category, date, note, receipt photo
- The split calculator (equal, room-rent, custom) as a tested pure function
- Approval flow above the threshold, with self-approval blocked by constraint
- Recurring expense definitions and the daily posting job
- Expense list with filters and running totals
- Receipt upload to Storage with client-side compression

**Acceptance**
- An expense of ₹1,240 across 8 members produces splits summing to exactly ₹1,240, remainder paise included
- An expense above the threshold cannot be approved by its payer — blocked at the database, verified by test
- Rent posts automatically on the configured day, split by room occupancy
- Every member sees every expense within seconds of it being logged
- Property test: for amounts ₹0.01 to ₹10,00,000 and head counts 1 to 30, splits always sum exactly

---

### Phase 3 — Month close

**Goal:** the manual month-end split-up disappears.

**Scope**
- Monthly periods with their state machine, and the immutability trigger
- Balance computation: paid, fair share, net, per member
- The netting algorithm as a tested pure function
- Settlement records with UPI deep links
- Mark-paid and confirm-received flow, with the period locking on full confirmation
- Late-expense handling: the closed-period detection, the admin's carry-forward-or-reopen choice, and split computation against historical membership
- Reopen with delta settlements

**Acceptance**
- Closing August with 8 members and 40 expenses produces at most 7 payments whose amounts net to exactly zero
- A close is refused while any approval is pending, and the blocking expenses are listed
- A closed period rejects writes at the database level
- An expense dated 18 July logged on 3 August offers both options, and carry-forward splits it against July's membership
- Every settlement's UPI link opens a payment app with the correct amount pre-filled

**Note:** penalty fields exist in the schema and compute to zero. They activate in phase 5.

---

### Phase 4 — Chore engine

**Goal:** the work becomes visible, assigned and recorded. The core of the product.

**Scope**
- Chore templates with points, duration, slot, scope, frequency, heavy flag
- Demand expansion from templates to dated instances
- The constraint validator (HC-1 to HC-8) as a tested pure function
- The greedy solver plus local search
- `schedule_runs` and the weekly generation job on `pg_cron`
- The full assignment lifecycle: done, confirm, reject, retry, miss, swap, release, claim
- The 48-hour auto-confirm job
- The effort ledger, weekly close, and the leaderboard
- House week view and personal chore view

**Acceptance**
- A generated week assigns every instance or explicitly marks it open — nothing is dropped
- No assignment violates any hard constraint, proved by property test over randomised availability
- Marking a chore done and having it confirmed by a peer posts exactly its points, exactly once
- An unconfirmed chore auto-confirms at 48 hours and posts its points
- Nobody can confirm their own chore — blocked at the database
- The leaderboard shows each member's earned, target and running carry
- Generation for 30 members and 200 instances completes in under 5 seconds

**Simplification for this phase:** availability is not yet modelled. Every member is treated as available in every slot, so the solver optimises on points alone. Phase 5 adds the real constraint. This keeps phase 4 shippable and lets the lifecycle be validated with real use before the harder scheduling problem lands.

---

### Phase 5 — Availability, guests, and the penalty

**Goal:** the schedule fits real lives, and not doing the work finally costs money.

**Scope**
- Seven-day availability capture during onboarding, with the derived-windows preview
- Window derivation and the fit test, wired into HC-1
- Date exceptions, with redistribution when a published week is affected
- Presence-adjusted targets (declared absence only — never availability)
- Guest registration, guest chore assignment with host accountability, guest head-count in expense splits
- Penalty computation at month close, and credit distribution to surplus members
- Penalty amounts flowing into the settlement

**Acceptance**
- A member who leaves at 07:00 is never assigned a morning chore
- A member with a 07:00–22:00 weekday pattern receives the same points target as everyone else, met with weekend-weighted work — verified explicitly, since this is the design's most contested rule
- Declaring an away day redistributes that day's assignments and reduces that member's target proportionally
- A weekend guest appears in Saturday's schedule and in Saturday's expense head count, billed to their host
- A member ending the month 85 points in deficit owes 85 × the rate, credited to surplus members, and it appears in their settlement
- `Σ penalty_credit = Σ penalty_owed` exactly

**At the end of this phase the house's original problem is solved.** Everything after improves adoption and insight.

---

### Phase 6 — Household shapes, dependents, daily cost, categories

**Goal:** the product serves a family as honestly as it serves a flatshare, and
every mouth in the Home is counted whether or not it owns a phone.

**Scope**
- `houses.household_type` — `shared` or `family` — chosen once at creation,
  setting the defaults for three independent settings underneath: `money_mode`,
  `effort_mode` and `penalty_enabled`, each editable afterwards (D-21)
- `money_mode = 'pot'`: an expense sits on whoever paid and creates no debt; the
  month nets to nothing and settlement is hidden (D-22)
- `member_kind` — `adult` or `dependent`. A dependent may have no `user_id`,
  carries their name on the membership row, and has its own `shares_cost` and
  `does_chores` flags (D-23)
- A dependent's share of an equal split lands on their guardian, through the
  same arithmetic a guest's share already uses. A guardian may mark a
  dependent's chores done but may never confirm them (D-24)
- `/money/daily` — spend per day and per head against a daily budget, a bar per
  day for the month, category spend against category budgets, and a projection
  for the month at the rate so far
- `/house/categories` — a screen for the custom categories, icons and monthly
  budgets that have existed in the API since phase 2 with no screen anywhere,
  reading the same summary the running-cost screen uses
- In a Family Home, confirmation may be reduced to a single acknowledgement or
  switched off entirely, per Home setting (CE-10)

**Acceptance**
- A family's grocery bill counts every mouth and bills only the guardians
- A dependent never receives a split row of their own
- Shares sum exactly to the amount for any mix of payers, dependents and guests
  — a property test, not a worked example
- A month of pot-mode expenses nets to nothing, and the settlement screen is
  absent rather than empty
- A guest whose host has moved out is not a head, and the sum still holds
- A guardian cycle terminates instead of hanging
- A children-only bedroom does not divide its own rent
- The daily average counts days with no spending, and the projection is never
  below what has already been spent
- The chart and the headline figure on `/money/daily` are the same money

---

### Phase 7 — Notifications

**Goal:** the app reaches members without them opening it.

**Scope**
- Web Push subscription, VAPID, per-device registration, 410 cleanup
- The hourly reminder job, timed against each member's availability
- Confirmation-request push when a chore is marked done
- Missed-chore escalation: reminder, then house feed, then penalty
- Weekly digest (numeric only at this stage)
- A device list a member can read and prune
- Preferences and quiet hours

**Acceptance**
- A chore reminder arrives before the window opens, and never inside quiet hours
- A member who returns at 19:00 receives their evening reminder near 19:00, not at 09:00
- Marking a chore done pushes a confirmation request to other members
- The Sunday digest reaches every member by push, on every device they have registered
- An expired push subscription is deleted on its next failure, without breaking the send batch

---

### Phase 8 — Analytics

**Goal:** the house can see what it has been doing.

**Scope**
- Category spend by month with a trend line
- Paid-versus-fair-share per member
- Per-member cost of living
- Effort analytics: points, completion rate, miss rate, and the top-three concentration ratio over time
- Budget alerts, daily job
- CSV export

**Acceptance**
- The top-three concentration ratio — the BRD's headline metric — is visible as a chart with a month-by-month trend
- Every chart renders correctly at 360 px width
- Budget breach produces an alert on the day it happens
- Export produces a CSV that opens correctly in a spreadsheet

---

### Phase 9 — Intelligence

**Goal:** turn the numbers into something the house reads, and reduce entry friction.

**Scope**
- The provider-agnostic LLM adapter with timeout, retry and schema validation
- A provider registry over three wire formats — `openai-chat`, `gemini`, `anthropic` — covering Gemini, Groq, OpenRouter, Hugging Face, Cerebras, Mistral, OpenAI, Anthropic and a custom OpenAI-compatible URL
- Per-house credentials: provider, model and key chosen by the admin during house creation, sealed with AES-256-GCM, with an optional skip and a settings panel for later entry, verification, replacement and removal
- The weekly fairness digest, replacing the numeric one when a key is present
- LLM schedule proposal with full hard-constraint validation and whole-proposal rejection
- Natural-language entry for expenses and chore completion, always confirmed by the user before writing
- `llm_runs` logging and an admin view of acceptance rate

**Acceptance**
- With no key configured, every feature in phases 1 to 8 behaves identically — verified by running the full test suite with no key set anywhere
- A house creates itself, picks a provider, pastes a key, sees it verified against that provider, and generates its next schedule through it — and a second house on a different provider does the same without either key touching the other's call
- No route response, log line or `llm_runs` row carries a stored key; a member reading `house_llm_credentials` directly gets zero rows
- An LLM proposal violating a single hard constraint is rejected whole, and the deterministic schedule is used
- The digest names who carried the house and who coasted, and states what next week corrects
- "paid 840 for vegetables yesterday" produces a correct proposal that the user confirms before it is saved
- No email address, phone number, surname or UPI identifier appears in any `llm_runs.input_payload` — verified by test

---

### Phase 10 — Membership and Homes

**Goal:** a person belongs to several Homes, joins by asking rather than by being
created, and the Home has an operational partner as well as an Admin.

**Scope**
- `member_role` gains `co_admin`; `member_status` renames `pending` to
  `requested`, with every policy, function and constraint naming it restated in
  the same migration
- `role` becomes null while `requested`, tied by check constraint in both
  directions (HM-07)
- `invitations` and `join_requests`; the public invite-link landing page; the
  request flow; accept and decline
- Removal of every admin-creates-member path, including from the seed and the
  test fixtures. A dependent stays creatable by a guardian and is the documented
  exception
- My Homes, the Home switcher, and a server-side selected Home
- `houses.home_type` as an enum, plus the location columns
- `Inactive` with `pending_settlement`, and the daily job that completes a
  removal once a member is financially clear
- `is_house_lead()` and the Admin/Co-Admin policies that use it

**Acceptance**
- A person opens an invite link, signs in, requests, is accepted, and appears as
  an Active member — and there is no endpoint anywhere that could have created
  them without asking
- A `requested` person receives **zero rows from every table in their own Home**,
  proved by the RLS loop, not by inspection
- A `requested` person's row has no role, and setting one without moving to
  `active` is refused by the database
- A person in three Homes sees three cards, switches between them, and their
  role in one has no effect in another
- Rotating the invite link invalidates the old one and affects no existing
  membership or open request
- Removing a member with money outstanding leaves them `Inactive` and flagged,
  keeps them in the settlement, and completes the removal automatically when the
  last payment is confirmed
- Every existing test that referenced `'pending'` passes against `'requested'`
- **A new Home is usable before it is configured (HM-20):** the seeded workload
  is one a real Home can meet in its first week, the Admin is shown the weekly
  total and the per-member target it implies, and no screen demands a complete
  chore catalogue, member list or rule set before the Home can record anything

**Migration note.** The enum rename is silent to `select`, which is why the
migration has to go looking for the string rather than trusting the type system:
`grep -rn "'pending'" supabase/migrations lib/ app/ tests/`.

---

### Phase 11 — Governance

**Goal:** important decisions stop being one person's to make. This is the phase
that changes what the product *is*, and it is the one to build slowly.

**Scope**
- `governance_policy`, `decisions`, `decision_participants`, `decision_responses`
- The pure resolver, the participant selector, and their property tests
- `apply_decision` as a `security definer` function with `execute` revoked from
  `public`, `anon` and `authenticated`, and one effect dispatcher per decision
  type
- The Approvals surface, its aggregated queue, and Approve All with its
  Critical-decision exclusion
- Size-aware confirmation quorum: `chore_confirmations`, the snapshot on "done",
  the completion trigger, and the reworked confirm endpoint
- `absence_requests`, the preview, the approve/reject effects, and the
  distinction between an excused absence and a missed chore
- Close and reopen become decisions; `balance_adjustments` arrives with them
- Enabling penalties or changing the rate becomes a decision
- **Shared chore assignment (CE-11):** an instance with more than one assignee,
  its exact point division, and the quorum excluding all of its assignees
- **Expected monthly contribution (EX-13) and the reserve (EX-14):**
  `member_expected_contributions`, `reserves`, `reserve_movements`, the three
  new decision types, and the draw's effect on an expense's split
- The three governance jobs: expire, remind, complete-pending-removals
- Notifications N-40 to N-46

**Acceptance**
- **In a Home of two or more people, no sequence of one member's own responses
  moves a Critical decision to `approved`** — property-tested over randomised
  Home sizes, role distributions and policies
- `apply_decision` refuses a decision that is not `approved`, and refuses one
  missing a mandatory response, when called with the service-role key
- A member cannot respond to a decision they are not a participant in, cannot
  respond on another member's behalf, and cannot revise a response — all three
  refused by RLS and by the absence of an update policy
- The subject of a decision is never one of its participants
- A rejection with a nine-character reason is refused; the same rejection at ten
  characters resolves the decision immediately
- A decision past its deadline is `lapsed` by the hourly job with nobody logged
  in, takes no effect, and is still readable
- Approve All approves five eligible items and skips a Critical decision that
  would have completed on the caller's tap, naming why
- A four-person Home's chore requires an Admin or Co-Admin plus one other; three
  ordinary members confirming it does not confirm it
- The quorum snapshotted at "done" does not move when somebody joins mid-window
- An approved absence removes the chores and the target; a rejected one leaves
  them and they miss normally
- Closing August requires the Co-Admin's acknowledgement and three members', and
  the settlement rows are written at apply time from apply-time numbers
- `Σ final_net = 0` still holds with adjustments in the close
- A 25-point chore shared by three members divides 8 / 8 / 9, and the three
  shares sum to 25 with no rounding loss
- Neither shared assignee can confirm their shared chore; in a two-person Home
  where both are assignees it auto-confirms at the window instead of blocking
- A draw larger than the reserve balance is refused at proposal time, so the
  Home is never asked to approve a decision that cannot apply
- A funded reserve changes nobody's settlement position until a draw is applied
- `Σ variance(m) + reserve_balance = 0` for the period, property-tested
- An expected contribution set for a member charges them nothing: it changes the
  position view and no settlement figure

**The one to watch.** This phase can make the product unusable if the levels are
set too high. Ship it with the documented defaults, and ship the Approve All
control in the same release as the decisions themselves — not a version later.

---

### Phase 12 — Rules

**Goal:** the Home writes its own rules, in its own words, and they are versioned
forever.

**Scope**
- `home_rules` and `home_rule_versions` with the activation constraint
- The structured-rule form, which works with no AI at all
- `POST /api/rules/parse` as the fourth LLM call site, returning a proposal and
  storing nothing
- Submission, editing and disabling as `change_rule` decisions
- The rules list with per-rule Edit, Disable and History
- The two executed kinds: `chore_missed → reschedule`, and a weight or penalty
  feeding the effort and settlement engines

**Acceptance**
- An Admin types a rule in plain English and gets a structured proposal they can
  edit before submitting
- With no key configured, the same rule is enterable through the form and the
  module is complete — rules are not an AI feature
- A rule row with `activated_at` set and no `decision_id` is refused by the
  database
- Editing an active rule creates version 2, leaves version 1 readable with its
  original dates and values, and changes nothing until the decision applies
- The history of a rule answers who, when, from what, to what, why and who
  acknowledged
- A rule with a penalty weight affects a settlement only after activation, and
  the effect appears in that month's close

---

### Phase 13 — Food

**Goal:** the Home knows what it eats, what that costs, and what to eat tonight.

**Scope**
- `foods`, `meals`, `meal_items`, `meal_participants`, `food_preferences`
- The Add Meal flow, in the order of section 8.1 of
  [15-FOOD-SPEC.md](15-FOOD-SPEC.md): name, participants, source, cost, then
  everything optional
- Library matching and the did-you-mean panel; merge for leads
- Per-person cost with exact remainder distribution and its deferred trigger
- Ratings, Home preference, person preference, and the item-level override
- The deterministic recommender, its reasons, and its cold-start message
- AI food ideas as the fifth call site, with the full validation contract
- Optional links to and from expenses, in both directions, with no cascade
- Food history, and the food slices of Insights
- **Planned meals (FD-20):** placing a suggestion or a library meal on a future
  date, and the confirm-as-eaten step that turns it into a record

**Acceptance**
- A meal with only a name and a date saves
- ₹180 across three participants is ₹60 each, exactly, and a total that does not
  divide still sums back to the total
- Four spellings of one dish offer a match rather than creating four entries, and
  nothing merges without a person confirming
- A member who dislikes an ingredient is never shown a meal containing it, while
  the Home's own ranking of that meal is unchanged
- The same data always produces the same two suggestions, in the same order
- With four recorded meals, the library half says so and shows recent meals
  rather than a score
- With AI returning a library duplicate, a disliked item, a named restaurant, or
  one idea instead of two, the AI half disappears and the library half still
  renders — with no error anywhere
- Voiding an expense linked to a meal leaves the meal intact, and deleting a meal
  leaves the expense intact
- **Adding an expense never opens a food form**, and the ten-second entry flow is
  measured again at the end of the phase
- A planned meal creates no cost, no expense, no participants and no preference
  signal, and appears in no food history, Insights view or recommender input
  until a member confirms it was eaten

---

### Phase 14 — Today, Calendar and navigation

**Goal:** the product stops being five disconnected screens and becomes one
operating system for the Home.

**Scope**
- The six-item primary navigation: Home, Today, Chores, Money, Food, Insights
- The More menu, and the rule that promotes Approvals out of it whenever
  anything is pending
- The Today screen: presence, chores, money, food and its suggestions, and
  what is waiting on the caller
- The Home overview, and the three role-shaped dashboards
- The Calendar: day, week and month, composed from the other modules
- The universal quick-add, with its member and Admin variants
- Retirement of the five-item bar and the `/dashboard` route, with redirects
- **One-action Done (CE-12)** from Today and from the schedule, with the photo,
  the note and any confirmation step moved after the transition
- **The last-completed figure (CH-12)** on every template in the chore list and
  the schedule, derived from confirmed completions
- The Calendar shows planned meals from phase 13 alongside chores and money

**Acceptance**
- Every primary destination is reachable in one tap from every other
- Approvals appears in primary navigation with its count the moment anything is
  pending, and disappears when nothing is
- Today answers "what is happening now" without scrolling on a 360 px screen
- The Calendar's day view shows presence, chores, money, food and pending
  decisions for any date, in one request
- The quick-add offers exactly the actions the caller is permitted
- No screen in the app is reachable only from a URL
- Marking a chore done takes exactly one tap from Today; nothing is required
  before the tap, and the photo and note screens open after it
- Every template shows when it was last confirmed done and by whom; one that
  has never been confirmed reads "never completed" rather than showing its
  creation date or an empty cell
- A completion still inside its confirmation window shows as pending, not as the
  last-completed

---

### Phase 15 — Insights

**Goal:** one screen that answers questions about money, work, food and the Home
itself.

**Scope**
- `GET /api/insights` with its type, period, category and person filters
- The four types: money, chores, food, home
- Budgets, and the alert producer, carried over from phase 8
- Export across every type
- Retirement of `/analytics` and its routes, with aliases through the transition
- **The household financial position (IN-09):** expected against actual, fair
  share against paid, the Home's surplus or shortfall, and the reserve balance
  with its movements — derived from the settlement arithmetic, not reimplemented
- **Permanent export (IN-10, NFR-19):** CSV of every view, a full-history export
  of the Home's records, and the PDF settlement statement
- **Point explainability (EF-12):** every points figure openable to the dated
  records that produced it, for effort points and game points alike
- Family Homes present chore data as contribution, not as a competitive ranking

**Acceptance**
- One screen with filters replaces the four-tab analytics page, and there is no
  page-per-report anywhere
- The top-three concentration ratio — the BRD's headline metric — is still one
  tap from the Home screen
- Every chart renders at 360 px and is legible in both themes
- Food insights answer: home-cooked versus outside, spend over time, most liked,
  recently eaten, most repeated
- Home insights answer: how active, how many pending decisions, how unbalanced
- Export opens correctly in a spreadsheet, and a category named like a formula
  cannot execute on open
- The position view's "paid minus fair share" equals the settlement's
  `expense_net` for every member, from the same calculator
- Every points figure on every screen opens to components that sum exactly to
  it, and a zero is explained as readily as a total
- A member can export their own records and the Home's records with no tier, no
  cap and no waiting period, and the export routes have no feature gate on them

---

### Phase 15+ — Post-v2 extensions

**Goal:** close the gap between meal planning and grocery shopping, and add
the missing roundings and complaint feed.

**Note on scope.** The shopping list, multi-currency and recipe instructions are
version-2 non-goals in [01-BRD.md](01-BRD.md) §4.2 and §11, and therefore carry
no BRD requirement ID. They are specified in [09-BUSINESS-RULES.md](09-BUSINESS-RULES.md)
§1.13–1.14 and [15-FOOD-SPEC.md](15-FOOD-SPEC.md) §12–13, and the competitor
evidence that keeps them scheduled rather than dropped is recorded in
[16-COMPETITIVE-POSITIONING.md](16-COMPETITIVE-POSITIONING.md) §5.3. Nothing in
this phase is required for the version-2 release gate.

**Scope**
- Shopping list: generate from upcoming meal plans and pantry, check-off, share,
  link back to meals
- Recipe instructions field on meal plans and meals (optional, plain text)
- Multi-currency split rounding: each foreign-currency expense rounds its
  per-member share before summation; last-share absorbs the rounding remainder
- Announcements panel: admin-only, time-boxed broadcast messages on Today
- Chatbot complaints feed: AI-generated and Human-escalated items with the
  same governance path as decisions
- Gamification layer: opt-in per Home, points for completing chores, badges for
  chore milestones, streaks for consecutive active days (virtual only, no
  monetary linkage)

**Acceptance**
- A shopping list can be generated from the next 7 days of meal plans and
  shows quantity, unit and estimated price
- A member can check off items and the list updates for all members
- Recipe instructions appear in meal detail view and can be edited
- Foreign-currency expenses round correctly and the total matches the sum of
  rounded shares (last-share absorbs remainder)
- Announcements created by an Admin appear on Today and expire after their
  configured duration
- Chatbot complaints with evidence and source are surfaced and follow the
  decision/approval flow
- Gamification is off by default; when enabled, points and streaks display
  per member; badges appear in profile
- All new tables have RLS and cross-Home isolation tests

---

### Phase 16+ — Offline Mutation Queue

**Goal:** the app works reliably on poor connections by queueing mutations
locally and syncing when connectivity returns.

**Scope**
- Local-first mutation queue: create, update, delete operations stored locally
  before server submission
- Optimistic UI: mutations reflected immediately in the interface
- Background sync with conflict detection and resolution strategies
- Offline indicator showing connection state and pending mutation count
- Retry with exponential backoff; manual retry option
- Conflict resolution: last-write-wins for simple fields, user-prompted
  resolution for conflicting edits to the same record

**Acceptance**
- Creating an expense, logging a chore done, or entering a meal while offline
  succeeds locally and syncs when online
- The offline indicator shows pending mutations count
- Conflicting edits to the same record are detected and resolved without data
  loss
- The queue survives page reload (persisted to IndexedDB or equivalent)
- No data corruption when the device goes offline mid-sync

---

### Phase 17 — Native mobile clients (product phase 2)

**Goal:** installable Android and iOS clients for members who prefer native
apps, built after the web/API contract is stable.

**Scope**
- Choose and document the native stack after a mobile spike; no Expo or React
  Native dependency is currently installed.
- Reuse the versioned API, Supabase Auth flows, domain rules and RLS; do not
  reimplement settlement, scheduling or fairness logic in the client.
- Add secure session/token storage, auth callback/deep-link handling, upload
  flows, camera/photo permissions, offline/read-only states and accessibility.
- Add a provider-neutral device registration contract. Browser registrations
  continue to use Web Push/VAPID; Android and iOS use their native push
  providers and token rotation lifecycle.
- Configure Android package/signing and Play Console internal testing, then
  production release. Configure iOS bundle/signing, TestFlight and App Store
  release. Keep credentials outside the repository.

**Acceptance**
- The native clients perform the agreed web journeys against the same house and
  data without duplicating business rules.
- Native push arrives with the app closed on supported Android and iOS test
  devices, and revoked/rotated tokens stop receiving notifications.
- Receipt and chore-photo uploads work with platform permissions and failure
  states.
- App links from notifications and auth callbacks open the correct native
  screen, falling back safely to the web URL.
- Android Play internal testing and iOS TestFlight acceptance are complete
  before public release; store listings, privacy policy, support contact and
  account/data-deletion flows are present.
- Any backend changes required for native registration are migrated, RLS-tested,
  API-documented and backwards-compatible with the web client.

---

## 4. Requirement coverage

Every requirement in the BRD maps to a phase. Nothing is unassigned.

| Requirement group | Phase |
|-------------------|-------|
| HM-01 … HM-08 | 1 |
| EX-01 … EX-05, EX-07 … EX-09 | 2 |
| EX-06 (guest head count) | 5 |
| ST-01 … ST-08 | 3 |
| CH-01 … CH-11 | 4 |
| CE-01 … CE-08 | 4 |
| CE-09 (guest chores) | 5 |
| EF-01 … EF-03, EF-06 | 4 |
| EF-04, EF-05 (penalties) | 5 |
| AV-01 … AV-06, AV-09 | 5 |
| HM-02, HM-16 (household shapes and dependents) | 6 |
| CE-10 (family-Home confirmation setting) | 6 |
| NT-01 … NT-06 | 7 |
| NT-08 (a member's own device list) | 7 |
| AN-01 … AN-06 (1.0 IDs, superseded by IN-01 … IN-10) | 8 |
| AI-01 … AI-05 | 9 |
| HM-01, HM-03 … HM-15, HM-17 … HM-20 | 10 |
| GV-01 … GV-12 | 11 |
| AP-01 … AP-06 | 11 |
| CE-02, CE-03, CE-11 (quorum and shared assignment) | 11 |
| AV-04 … AV-08 (absence) | 11 |
| ST-02, ST-08, EX-12, EX-13, EX-14, EF-07 (governed money) | 11 |
| RL-01 … RL-10 | 12 |
| FD-01 … FD-20 | 13 |
| CL-01 … CL-05, DB-01 … DB-06 | 14 |
| CH-12, CE-12 (last-completed, one-action Done) | 14 |
| IN-01 … IN-10 | 15 |
| EX-10, EX-11 (owed-to and owed-by for everyone, netted for display) | 15 |
| EF-12 (point explainability) | 15 |
| DB-07 (announcements) | 15+ |
| EF-08 … EF-11 (gamification) | 15+ |
| CM-1 … CM-4 (BRD §4.3) and NFR-18 … NFR-20 | every phase — section 6, items 9 to 11 |
| Offline mutation queue, optimistic UI, conflict resolution | 16+ |
| NT-07 (decision notifications) | 11 |
| AI-06 … AI-08 (new call sites) | 12 and 13 |
| AI-09 … AI-12 (never authoritative, no personal data sent, every call logged, deterministic core) | 9, and re-verified in 12, 13 and 15+ — section 6, item 6 |
| AI-02 (capabilities) | 12 |
| Native Android/iOS clients and store release | 17 / product phase 2 |

---

## 5. Risks to the schedule

| Risk | Phase | Mitigation |
|------|-------|------------|
| The solver produces visibly unfair schedules that the house rejects | 4 | Ship the leaderboard alongside it, so the fairness is auditable rather than asserted. Keep the admin override. |
| Availability data is entered carelessly and the schedule becomes nonsense | 5 | Show the derived windows immediately on save, so the member sees what the system concluded and corrects it |
| Members ignore push notifications | 7 | Every device the member owns is registered and reached, the volume cap keeps the ones that arrive worth reading, and the in-app feed remains the record whatever the phone did |
| The LLM's free tier rate-limits the digest | 9 | Asynchronous and non-blocking, with the numeric digest as fallback |
| Native push differs from browser Web Push | 17 / product phase 2 | Keep a provider-neutral device contract; implement and test platform adapters instead of reusing browser endpoints or VAPID credentials |
| Store review blocks launch | 17 / product phase 2 | Treat privacy, support, account deletion, permissions explanations, signing, screenshots and real-device acceptance as release gates |
| Phase 5's penalty mechanism causes a genuine house argument | 5 | Introduce it with the rate set to zero for the first month, so everyone sees what they *would* have owed before any money changes hands |
| **Governance makes the product feel bureaucratic and people route around it** | 11 | Ship the defaults, not the maximum. Most actions stay level 1 and need nothing. Acknowledgement rather than approval wherever a veto is not appropriate. Approve All in the same release as decisions, never a version later. Measure it: if a Home's median decision takes more than two days to resolve, the defaults are wrong. |
| **The enum rename breaks something silent** | 10 | `'pending'` is a string the type system cannot help with. Grep the whole tree in the same migration, and make the RLS loop cover a `requested` member so a missed policy fails the suite. |
| **Retrofitting decisions under features that already shipped** | 11 | Close, reopen, removal and confirmation all change behaviour in this phase. Each gets its old route kept as a proposer rather than deleted, so a client that has not been updated gets a clear `409 DECISION_REQUIRED` rather than a 404. |
| **Food entry never happens and the recommender stays cold** | 13 | Three fields to record a meal, the library to remove retyping, and an honest cold-start message rather than a fabricated ranking. The module is optional by design, so a Home that ignores it loses nothing. |
| **AI food ideas hallucinate a restaurant** | 13 | Validation before render, not after. A named brand, a duplicate or a disliked item drops the entire AI half silently. |
| **Six primary destinations is one too many at 360 px** | 14 | Measure it on a real 360 px device before the phase closes. If it does not fit, Insights moves to More — not Food, and not Approvals when something is pending. |

The last one deserves emphasis. The penalty is the product's sharpest edge. Running it in shadow mode for one month — computing and displaying it while charging nothing — converts an ambush into a warning, and makes the first real charge something the house agreed to rather than something the app did to them.

---

## 6. Definition of done, per phase

A phase is complete when all of the following are true. Not most.

1. Every acceptance criterion above passes, demonstrated by running it, not by reading the code.
2. Domain logic has unit tests, including the phase's stated property tests.
3. Every new table has RLS enabled and a test proving cross-Home isolation, **and a test proving a `requested` member gets zero rows from their own Home.**
4. Every new screen works at 360 px width.
5. Migrations apply cleanly to a fresh database.
6. The full test suite passes with no LLM key configured — neither in the environment nor in any Home.
7. The seeded demo Home exercises the new functionality.
8. **Nothing the phase adds gives one person a way to complete a Critical decision alone.** From phase 11 onward this is a checklist item on every phase, not only on the governance one, because the way this property gets lost is a later feature adding a convenient shortcut.
9. **Nothing the phase adds meters, caps or tiers a recording action** (CM-1, NFR-18). A new abuse limit is sized so ordinary household use never reaches it, and the sizing is stated.
10. **Nothing the phase adds removes, restricts or gates an export path** (CM-3, NFR-19). A phase that adds a new record type adds it to the export.
11. **No mutation the phase adds reports success before the server has confirmed the write** (CM-4, NFR-20). A failure surfaces, keeps the entered values, and stays retryable.

Items 9 to 11 come from the competitor complaints recorded in
[`Competitor_Analysis.txt`](Competitor_Analysis.txt) and mapped in
[16-COMPETITIVE-POSITIONING.md](16-COMPETITIVE-POSITIONING.md) §3. They are on
every phase for the same reason item 8 is: this is the kind of property a later
convenience quietly removes.
