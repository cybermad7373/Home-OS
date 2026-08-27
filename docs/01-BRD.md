# 01 — Business Requirements Document

**Product:** HouseOS
**Version:** 2.0 (Home OS baseline)
**Date:** 2026-08-26
**Supersedes:** v1.0 (2026-08-23)
**Status:** Approved for technical design

---

## 0. What changed in version 2.0, and why

Version 1.0 described a chore-and-expense manager for one shared bachelor house
with one all-powerful admin. It was correct about the problem and too narrow
about the product. Version 2.0 keeps every foundation it got right — permanent
records, points-based fairness, exact money, immutable closed periods,
deterministic operation without an LLM — and changes five things.

| # | Change | Reason |
|---|--------|--------|
| 1 | **The product is a Home Operating System**, not a chore app. It manages People, Home, Work, Money, Food, Calendar, Decisions and Insights. | The modules the house actually needs are not separable. Food spending is money; food is also planning; planning is calendar. Keeping them apart produced disconnected dashboards. |
| 2 | **Shared governance replaces admin ownership.** Admin initiates and maintains; important decisions require acknowledgement or approval from others. | v1.0 let one person close a month, change a penalty rate or remove a member alone. In a real shared home that is how the app becomes "his app". |
| 3 | **Food becomes a first-class module**, not an AI feature. Named meals with items, sources, costs and participants; a Home food library; per-person preferences; two library suggestions and two AI ideas. | Food is the largest recurring cost and the most frequent daily decision in a shared home. It was previously only an expense category. |
| 4 | **One generic Decision engine and one generic Approval engine.** Expenses, chores, absences, join requests, rules, settlements, removals and adjustments all use them. | v1.0 was heading towards eight parallel approval implementations that would each behave slightly differently. |
| 5 | **Simple vocabulary in the interface, complex model underneath.** Person, Member, Requested, Rule, Food, Money, Approve, Acknowledge, Done. | Nobody living in the house should have to learn the words "governance engine" or "effort deficit" to wipe a counter. |

**The one sentence the rest of this document serves:**

> Everyone can record. Everyone can see. Everyone can give input. Important
> things require shared acknowledgement. Admin manages the system but does not
> own the Home. AI assists people but never becomes the authority.

### 0.1 Naming: Home in the interface, house in the schema

The interface says **Home**. The database, the API paths and the code say
`house`, because forty-plus applied migrations, every RLS policy and every
repository already do, and a rename would be a large mechanical migration that
buys a word. The mapping is fixed and total:

| Interface word | Schema / code identifier |
|---|---|
| Home | `houses`, `house_id`, `/api/houses` |
| Person | `users` |
| Member | `house_members` |
| Requested | `house_members.status = 'requested'` |
| Rule | `home_rules` |
| History | `activity_log` |

New tables introduced by this version use the domain's own word (`home_rules`,
`meals`) and carry `house_id` like every other house-scoped table. See D-39.

---

## 1. Product delivery phases

HouseOS is delivered in two product phases. The engineering milestones in
`07-ROADMAP.md` are subphases within these, and must not be mistaken for
separate product launches.

| Product phase | Scope | Release outcome |
|---|---|---|
| 1 — Web/PWA | The full Home OS in a browser or installed PWA: People, Work, Money, Food, Calendar, Governance, Insights, optional AI, production hardening | A real home can run itself on HouseOS in a browser or installed PWA |
| 2 — Native mobile | Android and iOS clients consuming the stable backend, native push, camera/upload integration, deep links, accessibility and store release work | Play Store and App Store builds support the same household workflows |

The native phase is deliberately downstream of a stable web/API release. It
shares domain rules and backend contracts, but it is not specified as a WebView
wrapper and it does not inherit browser Web Push assumptions.

---

## 2. Background

Eight people share a rented house. Two functions of the household have
collapsed onto a minority of the residents, and a third is invisible entirely.

**Work.** Cooking, kitchen cleaning, bathroom cleaning, room cleaning, mopping
and general upkeep are performed by three or four members. The rest contribute
nothing operationally, treating the working minority as household staff. There
is no schedule and no record, so there is no basis on which to raise it.

**Money.** Three members pay for everything all month. At month end an informal
split-up is calculated and the month is closed with no record retained.
Expenses discovered after the close are silently absorbed; nobody can see where
the money goes or how lopsided the paying is.

**Food.** The house eats every day, spends more on food than on anything except
rent, and keeps no record of what it ate, what it cost, who ate it or whether
anyone liked it. Every evening the same question — "what do we eat" — is
answered from nothing.

All three share a root cause: **the household's labour, spending and
consumption are invisible.** Nothing is recorded, so nothing can be measured,
so nothing can be fairly allocated or fairly argued about.

A fourth problem appears the moment the first three are solved: **who decides.**
Once the app holds the record, whoever controls the app controls the argument.
That is the problem shared governance exists to prevent.

---

## 3. Vision

A single application that everyone who lives in the home logs into, in which:

- the home's work is **generated automatically each week**, distributed by
  measured effort and real presence, and assigned to named people on named days;
- every completed chore is **confirmed by other people**, in a quorum sized to
  the home, and permanently recorded;
- **failure to do assigned work has a consequence** that the home itself agreed
  to;
- every rupee spent is **logged by the person who spent it**, split
  automatically, visible to everyone as who-owes-whom, and settled at month end
  with the fewest possible payments;
- every meal can be **named, costed, shared and rated**, building a food library
  that answers "what do we eat tonight" from the home's own history before it
  ever asks a model;
- one **calendar** shows people, work, money, food and pending decisions on any
  day, week or month;
- **important decisions are shared**: proposed by one person, acknowledged or
  approved by the people the home's own rules require, and recorded forever;
- everyone can see **everything**, including who is carrying the home and who is
  coasting.

---

## 4. Goals and non-goals

### 4.1 Goals

| # | Goal | How the product achieves it |
|---|------|-----------------------------|
| G1 | Distribute domestic work fairly | Weekly auto-generated schedule balanced on effort points, constrained by real presence |
| G2 | Make non-participation visible | Public effort standing; size-aware peer confirmation; permanent record |
| G3 | Remove the manual month-end split-up | Continuous expense logging with automatic split and netted settlement |
| G4 | Preserve a permanent, auditable record of work, money, food and decisions | Immutable History; closed periods locked; every decision, vote and acknowledgement dated and attributed |
| G5 | Give the home real insight | Cross-domain Insights over money, work, food and the home itself, filterable by day, week or month |
| G6 | Handle the real shape of the home | Home types, rooms, per-weekday presence, residency types, guests, dependents, multiple Homes per person |
| G7 | **Make important decisions shared rather than owned** | A generic Decision engine with approvals and acknowledgements, and a governance matrix the home configures |
| G8 | **Let the home write its own rules in its own words** | Plain-text rules parsed into structured proposals by AI, edited by a person, activated only by governance, versioned forever |
| G9 | **Answer "what do we eat" from the home's own history** | A food library of named meals with items, sources, costs, participants and per-person preference, feeding a deterministic recommender |
| G10 | Never require an LLM | Every feature has a deterministic path; the whole product works with no key configured anywhere |

### 4.2 Non-goals for version 2

| Not building | Reason |
|--------------|--------|
| In-app money movement (real payment processing) | Requires KYC, compliance and fees. UPI deep links achieve the same outcome for free. |
| Public multi-tenant SaaS with billing | The product must first work for real homes. The data model supports many; commercialisation is not in scope. |
| Rent collection from the landlord, or lease management | Outside the problem space. |
| Grocery inventory and the shopping list | Adjacent to Food and deferred out of version 2. Meals reference items; the pantry is not modelled in v2. Both are scheduled for the post-v2 phase 15+ in [07-ROADMAP.md](07-ROADMAP.md); the competitor evidence for them is recorded in [16-COMPETITIVE-POSITIONING.md](16-COMPETITIVE-POSITIONING.md) §5.3. |
| Nutrition analysis, calorie counting or dietary tracking | The meal-item model is built so this is possible later. It is not version 2. |
| Restaurant discovery, menus or ordering integrations | Location is context for suggestions, never a claim about what is open nearby. |
| Chat or messaging between members | The home already has a group chat. Duplicating it adds noise. |
| Native Android/iOS clients | Product phase 2. |
| Weighted or delegated voting | A decision needs approvals and acknowledgements from named people. Vote weights are a governance rabbit hole. |

### 4.3 Commercial and data commitments

These are product commitments, not features. They constrain how every feature
above is allowed to behave, and each answers a complaint recorded in
[`Competitor_Analysis.txt`](Competitor_Analysis.txt). They are mapped to
competitors in [16-COMPETITIVE-POSITIONING.md](16-COMPETITIVE-POSITIONING.md)
§3 and carried technically by NFR-18, NFR-19 and NFR-20 in
[02-TRD.md](02-TRD.md).

| # | Commitment | What it rules out |
|---|------------|-------------------|
| CM-1 | **Recording is never metered.** Logging an expense, a chore completion, an absence or a meal has no daily cap, no waiting period between entries, and no paid tier. | A free tier limited to a few expenses a day, with a wait before the next one — the complaint recorded against Splitwise. |
| CM-2 | **There is no premium tier and no advertising inside the product.** There is therefore no boundary to be inconsistent about, and no promotion interrupting a member mid-task. | Paywalled-here-but-not-there inconsistency and intrusive premium promotion — the complaints recorded against Cozi. |
| CM-3 | **Data portability is permanent.** Export of a member's own records and the Home's records is a capability of the product, not a feature that may later be withdrawn, restricted or moved behind a tier (IN-10). | Removal of export, and removal of the web version, after members had come to depend on them — the complaints recorded against Tricount. |
| CM-4 | **A recorded entry is never silently lost.** A write is confirmed against the server before the interface reports success. Where the system cannot write, it says so and keeps the entry retryable rather than reporting a success it did not achieve. | "I entered ₹2,000 and it disappeared" — the reliability complaint recorded against Tricount, and the sync failures recorded against Sweepy. |

CM-1 and CM-2 are statements about the product, not about a business model that
does not yet exist. Version 2 has no billing of any kind (§4.2). If
commercialisation is ever considered, these four commitments are the constraint
it has to be designed around, not the first thing traded away.

---

## 5. People, Homes and roles

### 5.1 The mental model

A person has one account. That account belongs to any number of Homes. A role
belongs to a person **inside a particular Home**, never globally.

```text
PERSON
├── Home A → Admin
├── Home B → Member
└── Home C → Co-Admin
```

### 5.2 Home types

Chosen once, at creation, and editable afterwards.

| | Shared Home | Family Home |
|---|---|---|
| Modules | Expenses, Chores, Presence, Fairness, Points, Approvals, Settlement, Food, Calendar, Insights | Expenses, Budget, Food, Calendar, shared information, optional Chores, Insights |
| Money | Every expense splits; the month nets into payments | One pot: the expense sits on whoever paid and creates no debt |
| Chore deficit | Costs money at the home's rate | Shows as points, never becomes money |
| Leaderboard | A standing everyone sees | A contribution view, not a competitive ranking |
| Penalties | Available, home-configured | Off, and not offered |

One backend serves both. The type sets defaults for the independent settings
`money_mode`, `effort_mode` and `penalty_enabled`, which remain editable (D-21).

### 5.3 Roles

Three roles, and one state that is not a role.

| Role | What it is |
|------|-----------|
| **Admin** | Custodian. Sets the Home up, maintains it, initiates governance, handles exceptions. Not an owner of other people's decisions. |
| **Co-Admin** | Operational partner. Performs almost all day-to-day operational work and is a required participant in critical decisions. |
| **Member** | Full participant. Records, sees, contributes and approves within their permissions. |
| *Requested* | **Not a role.** A person who has asked to join and has no permissions at all until accepted. |

There is no "Former Member". A person who has left is `Inactive`.

### 5.4 Membership states

```text
Requested → Active → Inactive → (removed, once financially clear)
```

| State | Meaning |
|-------|---------|
| **Requested** | Has asked to enter. No role, no permissions, no data visibility beyond the request screen. |
| **Active** | Currently participates. |
| **Inactive** | No longer participates operationally. History and financial obligations remain. |

### 5.5 Personas

**The Carrier.** Cooks, cleans and pays. Wants proof of the imbalance and a
mechanism that corrects it without requiring them to nag. Also the person most
harmed by an admin-owned app, because when the mechanism looks like one person's
will rather than the home's, it stops working.

**The Coaster.** Does not cook, clean or pay in-month. Often not hostile —
simply able to avoid work because nobody assigned any by name. Succeeds when the
ask is specific, fits their real schedule, and is small enough to be reasonable.

**The Admin.** Usually a Carrier. Sets up the Home and keeps it running. Succeeds
when setup is a one-time cost, the system runs itself, and the decisions that
cause arguments are visibly the home's rather than theirs.

**The Co-Admin.** Shares the operational load and is the second signature on
anything that moves money or membership.

---

## 6. Functional requirements

Requirements carry stable IDs used by the roadmap's acceptance criteria and by
tests. Groups introduced in version 2.0 are marked **new**.

### 6.1 Homes, membership and joining (HM)

| ID | Requirement | Priority |
|----|-------------|----------|
| HM-01 | A person can create a Home with a name, type, address, location, timezone and currency. The creator becomes its Admin. | Must |
| HM-02 | A Home has a type: `SHARED` or `FAMILY`, chosen at creation and editable by governance afterwards. | Must |
| HM-03 | A Home stores its location — country, state, city and an optional approximate area — used as context for food suggestions and for nothing else. **new** | Should |
| HM-04 | A person may belong to any number of Homes and switch between them. The currently selected Home is always visible. **new (was HM-07, Should)** | Must |
| HM-05 | A Home generates an invite link. A person opens it, signs in or creates an account, and requests to join. **new** | Must |
| HM-06 | **There is no admin-creates-member workflow.** Membership begins with a request from the person themselves. **new** | Must |
| HM-07 | A requested person has membership status `Requested`, no role, and no permissions of any kind in that Home. **new** | Must |
| HM-08 | Accepting a join request is an operational action available to Admin and Co-Admin, subject to the Home's governance policy. **new** | Must |
| HM-09 | Membership states are exactly `Requested`, `Active` and `Inactive`. | Must |
| HM-10 | Roles are exactly `Admin`, `Co-Admin` and `Member`. | Must |
| HM-11 | A Home always has at least one Active Admin. | Must |
| HM-12 | Removing a member is a critical decision: Admin initiates, Co-Admin acknowledges, and the Home's required member approvals are collected. **new** | Must |
| HM-13 | On approved removal the system checks the member's money position. Financially clear → removed. Not clear → `Inactive`, flagged "pending financial settlement". **new** | Must |
| HM-14 | An `Inactive` member with outstanding money remains in settlements until clear, then the removal completes. Their history is never deleted. **new** | Must |
| HM-15 | Each member has a residency type: `FULL_TIME`, `WEEKDAY_ONLY` or `WEEKEND_ONLY`. | Must |
| HM-16 | A member is `adult` or `dependent`. A dependent may have no account, is a head for cost, may hold chores a guardian marks done, and is never billed or fined directly. | Must |
| HM-17 | An Admin can define rooms with a name, capacity and monthly rent, and assign members to them with dated assignments. | Must |
| HM-18 | Home settings are configurable: penalty rate, expense approval threshold, schedule generation time, auto-confirm window, confirmation quorum policy, governance thresholds. | Must |
| HM-19 | An invite link is revocable and rotatable. Possession of a link never grants access — acceptance does. | Must |
| HM-20 | Home setup is conservative by default. The seeded chore templates produce a workload a real Home can actually meet in its first week, and setup never requires a complete chore catalogue before the Home is usable. Adding more is a later, incremental action. **new** | Must |

### 6.2 Governance and decisions (GV) — **new group**

| ID | Requirement | Priority |
|----|-------------|----------|
| GV-01 | Every action in the Home falls into one of three levels: **Normal** (no extra approval), **Important** (Admin or Co-Admin plus member acknowledgement), **Critical** (Admin plus Co-Admin plus required member approvals or acknowledgements). | Must |
| GV-02 | **Approval** and **Acknowledgement** are different. An approval is a required yes/no that gates the action. An acknowledgement is a confirmation of having seen it, which also gates the action but cannot reject it. | Must |
| GV-03 | One generic Decision record backs every shared decision: type, requester, target, required participants, required approvals, required acknowledgements, deadline, status, result. | Must |
| GV-04 | Decision types in version 2: close settlement, reopen settlement, remove member, change a rule, change governance policy, change Home type or money mode, balance adjustment, absence request, join request, expense approval, chore confirmation, set expected contribution, create reserve, draw from reserve. | Must |
| GV-05 | A decision that has not collected its required responses has status `Waiting`. Nothing changes until it is complete. Nothing changes silently, ever. | Must |
| GV-06 | The Admin can initiate any decision. The Admin cannot complete a Critical decision alone. | Must |
| GV-07 | The person who proposes a decision may not be the sole approver of it, and may never approve their own chore completion or their own expense. | Must |
| GV-08 | A decision has a deadline. On expiry it resolves as `Lapsed` and takes no effect; the record is kept. | Should |
| GV-09 | The governance matrix — which action needs what — is a configurable Home policy with documented defaults. | Must |
| GV-10 | Every decision, vote, acknowledgement, expiry and result is written to History with actor and timestamp. | Must |
| GV-11 | A Home may configure the number of member approvals or acknowledgements a Critical decision requires, as a count or a proportion of Active adult members. | Should |
| GV-12 | Changing the governance policy is itself a Critical decision. | Must |

### 6.3 Approvals (AP) — **new group**

| ID | Requirement | Priority |
|----|-------------|----------|
| AP-01 | One Approvals surface lists everything awaiting the caller, grouped by kind: expenses, chores, absences, join requests, member changes, rules, adjustments, settlement. | Must |
| AP-02 | Each group shows a count. Opening an item shows exactly what is being asked and the effect of approving it. | Must |
| AP-03 | **Approve All** exists, and applies only to items the caller is permitted to approve. | Must |
| AP-04 | Approve All never completes a Critical decision unless every other required participant has already responded. It contributes the caller's own response and nothing else. | Must |
| AP-05 | Approvals is reachable from the More menu, and is promoted to primary navigation whenever the caller has anything pending. | Must |
| AP-06 | Rejecting requires a reason of at least ten characters, on every approval kind. | Must |

### 6.4 Rules (RL) — **new group**

| ID | Requirement | Priority |
|----|-------------|----------|
| RL-01 | An Admin can write a house rule as plain text in their own words. | Must |
| RL-02 | When AI is configured and rule parsing is enabled, the text is parsed into a structured proposal: condition, action, applies-to, weight or penalty, start date, end date. | Should |
| RL-03 | **AI never activates a rule.** It produces a proposal that a person reviews and may edit. | Must |
| RL-04 | A rule becomes active only through the Home's governance flow for rule changes. | Must |
| RL-05 | Rules are individually editable and individually disableable. There is no single rule blob. | Must |
| RL-06 | A rule is versioned. Editing creates a new version; the old version is retained with its dates, values, reason and who acknowledged it. | Must |
| RL-07 | Rule history answers: who changed it, when, from what, to what, why, and who acknowledged. | Must |
| RL-08 | Without AI, an Admin can enter a structured rule directly through a form. Rules are not an AI-only feature. | Must |
| RL-09 | A rule's original text is stored verbatim alongside its parsed form, forever. | Must |
| RL-10 | Rules with a points or penalty weight feed the effort and settlement engines only after activation. | Must |

### 6.5 Presence, availability and absence (AV)

| ID | Requirement | Priority |
|----|-------------|----------|
| AV-01 | Each member records, per weekday, whether they are home. Times of leaving and returning are optional refinements, not a requirement. | Must |
| AV-02 | The system derives morning and evening free windows from those times where given, and treats a member with no times as home all day. | Must |
| AV-03 | A member can record an exception for a specific date: away, home all day, or different hours. | Must |
| AV-04 | An **Absence** is a member's declaration that they will not be in the home on given dates, with an optional request to excuse the chores it affects. | Must |
| AV-05 | An **approved** absence removes the affected chores from that member's workload: no penalty, no carry-forward, no extra work the following week. | Must |
| AV-06 | An **unapproved** absence — simply not showing up — is treated as a missed chore under the normal missed-work policy. | Must |
| AV-07 | Declared absence reduces a member's points target proportionally. Reduced availability never does. | Must |
| AV-08 | An absence request against a published week shows exactly which chores and how many points are affected before it is submitted. | Must |
| AV-09 | Availability changes apply to schedules generated after the change, never retroactively. | Must |

### 6.6 Chores and the weekly schedule (CH)

| ID | Requirement | Priority |
|----|-------------|----------|
| CH-01 | An Admin or Co-Admin defines chore templates: name, category, effort points, optional duration, time slot, frequency, day, person eligibility, and scope (whole Home or a specific room). | Must |
| CH-02 | Default chore categories: room cleaning, cooking, kitchen cleaning, bathroom cleaning, common-area cleaning, mopping, other. Categories are editable by the Home. | Must |
| CH-03 | A room-scoped chore is assignable only to occupants of that room. | Must |
| CH-04 | A cooking chore is assignable only to members flagged as able to cook. | Must |
| CH-05 | The system generates the next week's full schedule automatically at a configured day and time. | Must |
| CH-06 | Generation distributes effort points as evenly as the constraints allow, against each member's target — not an equal count of chores. | Must |
| CH-07 | A member is not assigned the same heavy chore in consecutive weeks where an alternative exists. | Should |
| CH-08 | Common-area workload is weighted by room occupancy. | Must |
| CH-09 | An instance with no eligible assignee goes to the open pool and the Admin is notified. Generation never aborts. | Must |
| CH-10 | An Admin or Co-Admin can override any assignment before or after publication. | Must |
| CH-11 | Every member can see the full Home schedule, not only their own assignments. | Must |
| CH-12 | Every chore template shows when it was last actually completed and by whom, and how long ago that was. A chore that has never been completed says so. **new** | Must |

### 6.7 Chore execution and confirmation (CE)

| ID | Requirement | Priority |
|----|-------------|----------|
| CE-01 | An assignee marks a chore done, optionally attaching a photo. | Must |
| CE-02 | A chore earns points only after **confirmation by a quorum sized to the Home**, never including the person who did it. | Must |
| CE-03 | Default confirmation quorum: 2–3 Active members → one other person; 4–6 → Admin or Co-Admin plus one other; 7 or more → Admin or Co-Admin plus two others. Configurable per Home. **new** | Must |
| CE-04 | An unconfirmed chore auto-confirms after the Home's configured window. The window is what prevents non-participation becoming a veto. | Must |
| CE-05 | Any member may reject a chore within the confirmation window, giving a reason. A rejection stops the quorum. | Must |
| CE-06 | A rejected chore returns to assigned with a one-day extension and one retry. A second failure marks it missed. | Must |
| CE-07 | A chore not marked done by its deadline is missed and earns zero points. | Must |
| CE-08 | An assignee may request a swap with a named member, or release the chore into the open pool for anyone to claim. Points move with the chore. | Must |
| CE-09 | A guest registered as assignable may be given chores; the host member remains accountable. | Must |
| CE-10 | In a Family Home, confirmation may be reduced to a single acknowledgement or switched off entirely, per Home setting. | Should |
| CE-11 | A chore instance may be shared between two or more assignees. Its effort points divide between them, summing exactly to the template's points. Each shared assignee is accountable, and confirmation still excludes all of them. **new** | Should |
| CE-12 | Marking a chore done is **one action** from Today or from the schedule. Photo, note and any confirmation step happen after that action, never before it, and never block it. **new** | Must |

### 6.8 Effort and fairness (EF)

| ID | Requirement | Priority |
|----|-------------|----------|
| EF-01 | Each member has a weekly points target derived from total workload, member count and declared presence. | Must |
| EF-02 | Surplus or deficit against target carries into the following week, capped to prevent runaway targets. | Must |
| EF-03 | Everyone can see everyone's earned points, target and running carry. | Must |
| EF-04 | In a Shared Home with penalties enabled, a month-end effort deficit becomes money at the Home's configured rate. | Must |
| EF-05 | Penalty money is credited to members in surplus in proportion to their surplus and enters the month's settlement. `Σ owed = Σ credited`, exactly. | Must |
| EF-06 | The full history of assignments, confirmations, rejections, absences and misses is permanently viewable per member. | Must |
| EF-07 | Changing the penalty rate or enabling penalties is a Critical decision. **new** | Must |
| EF-08 | Gamification is opt-in per Home (`game_layer_enabled`). Disabled by default; Admin toggles it on. **new** | Must |
| EF-09 | Points are earned for: completing a chore, earning a chore-earned badge, eating a home-cooked meal. Points are never deducted. **new** | Must |
| EF-10 | Streaks count consecutive days with at least one completed chore per member. Displayed per member, not as a leaderboard. **new** | Must |
| EF-11 | Streaks and badges are virtual-only. No real rewards, no monetary conversion, no linkage to chore targets or penalty rates. **new** | Must |
| EF-12 | A member can open any points figure — earned, target, carry, streak or badge — and see the assignments, confirmations, rejections, misses and point weights that produced it. No points number is presented without a path to its arithmetic. **new** | Must |

### 6.9 Money (EX, ST)

| ID | Requirement | Priority |
|----|-------------|----------|
| EX-01 | Any Active member can log an expense in under ten seconds: amount, category, date, who paid, split, optional note and receipt. | Must |
| EX-02 | The lifecycle is: Added → Pending approval → Approved → Included in Money → Settled. A rejected expense can be edited and resubmitted. | Must |
| EX-03 | An expense above the Home's threshold requires approval by someone other than the payer. | Must |
| EX-04 | Shared expenses split flat and equal across Active members on the expense date, unless overridden. | Must |
| EX-05 | Rent splits by room; each room's rent divides among its occupants. A vacant room is a Home cost. | Must |
| EX-06 | Guest days and dependents add to the head count; their share is billed to their host or guardian. | Must |
| EX-07 | A payer may override a split for a single expense — custom shares, or excluding specific people. | Must |
| EX-08 | Recurring expenses are defined once and post automatically each cycle. | Must |
| EX-09 | Approved expenses are visible to every member immediately. There is no hidden household spending. | Must |
| EX-10 | **Owed-to and owed-by are visible to everyone, for everyone** — not only the caller's own position. | Must |
| EX-11 | The system nets mutual debts for display: if A owes B ₹500 and B owes A ₹300, the Home sees A → B ₹200. | Must |
| EX-12 | A manual cancellation or correction of a balance is a **Balance Adjustment**, created through governance. Historical expenses are never modified. **new** | Must |
| EX-13 | A Home may set an **expected monthly contribution** per member. Each member's Money view then shows expected contribution, actual paid, fair share, and the difference — a position, not only a list of entries. Setting or changing it is a governed decision. **new** | Should |
| EX-14 | A Home may hold a **reserve**: a named pot that members contribute to and that the Home draws on for shared costs. Contributions and draws are ordinary recorded movements with a running balance; the reserve never nets against a member's personal position without an explicit draw. Creating a reserve, and every draw from it, is a governed decision. **new** | Should |
| ST-01 | A month cannot be closed while approvals are pending. | Must |
| ST-02 | Closing a settlement period is a **Critical decision**: Admin initiates, Co-Admin acknowledges, required member acknowledgements are collected, and only then does it close. **new** | Must |
| ST-03 | On close the system computes each member's total paid, fair share and net position, applies chore penalties and credits, and reduces the result to the minimum number of member-to-member payments. | Must |
| ST-04 | Each payment carries a UPI deep link pre-filled with payee, amount and note. | Must |
| ST-05 | The payer marks a payment sent; the receiver confirms receipt. The period locks only when every payment is confirmed. | Must |
| ST-06 | A closed period is immutable. | Must |
| ST-07 | An expense discovered after close is by default posted into the current open period as an adjustment tagged with the original period, split against the membership as it stood on the original date. | Must |
| ST-08 | Reopening a closed period is a **Critical decision** requiring a stated reason, Co-Admin acknowledgement and required member approval. Every reopen is recorded. **new** | Must |

### 6.10 Food (FD) — **new group**

| ID | Requirement | Priority |
|----|-------------|----------|
| FD-01 | A **Meal** is a named thing — "Paruppu Sadham", "KFC Combo" — not a slot called breakfast, lunch or dinner. | Must |
| FD-02 | A meal contains zero or more **items** (rice, dal, ghee, pickle), so that cost, preference and later nutrition can be reasoned about. | Must |
| FD-03 | A meal has a source: `HOME_COOKED`, `BOUGHT`, `ORDERED` or `OTHER`. | Must |
| FD-04 | A meal carries costs: base or ingredient cost, preparation cost, optional delivery cost, optional other cost, and a computed total. | Must |
| FD-05 | A meal names its **participants**. Per-person cost is total ÷ participants, not ÷ Home size. | Must |
| FD-06 | **Recording food is never mandatory.** Money works without it, and it works without Money. | Must |
| FD-07 | A meal may optionally be linked to an expense, and an expense may optionally be linked to a meal. Neither direction is ever required. | Must |
| FD-08 | A meal may optionally generate an expense with the meal's participants as its split, on explicit request. | Should |
| FD-09 | Saving a meal offers to add it to the Home's **Food Library**, so it can be reused. | Must |
| FD-10 | On entering a name close to an existing library entry, the system offers the match rather than creating a near-duplicate. The final library entry is always user-confirmed. | Must |
| FD-11 | Every person can rate a meal or a food: **Like**, **Okay** or **Dislike**. | Must |
| FD-12 | The system holds both a Home-level preference and a per-person preference for every food. | Must |
| FD-13 | An individual's preference overrides the Home's **for that individual's recommendations only**. A meal the Home likes stays acceptable as a Home meal. | Must |
| FD-14 | Suggestions are presented in exactly two clearly separated groups: **two from your Home** (library, deterministic) and **two AI ideas** (new, optional). | Must |
| FD-15 | The library recommender is deterministic and works with no AI configured. Its score combines preference, recency, repetition, cost, budget position, meal type and location relevance. | Must |
| FD-16 | AI suggestions receive structured context — location, popular meals, likes, dislikes, recent meals, budget, outside-food frequency — and may propose meals the Home has never eaten. | Should |
| FD-17 | AI food output is a suggestion only. It never writes a meal, never creates an expense, and never edits the library. | Must |
| FD-18 | Food history answers: what we eat, how often, what it costs, home-cooked versus outside, and what is most liked. | Must |
| FD-19 | Location is context for suggestions. The system must not assert the availability, price or existence of a specific named restaurant without verification. | Must |
| FD-20 | A suggestion, or any library meal, may be **placed on a future date** so the Calendar shows what the Home intends to eat. A planned meal is an intention, not a record: it creates no cost, no expense and no participants until it is confirmed as eaten. **new** | Should |

### 6.11 Calendar (CL) — **new group**

| ID | Requirement | Priority |
|----|-------------|----------|
| CL-01 | A single Calendar shows Day, Week and Month views for the Home. | Must |
| CL-02 | A Day shows presence (who is home, who is away), chores with assignees, money logged, meals eaten, and pending decisions. | Must |
| CL-03 | A Week shows per-member points, total money, meals logged and pending approvals. | Must |
| CL-04 | A Month shows total money, total points, completion rate, meals, outside-food spend and home-cooking spend. | Must |
| CL-05 | The Calendar is reachable from Today and from More. It does not occupy a primary navigation slot. | Should |

### 6.12 Today and dashboards (DB) — **new group**

| ID | Requirement | Priority |
|----|-------------|----------|
| DB-01 | **Today** is the operational screen: people home and away, today's chores, today's money, today's food and its suggestions, and anything waiting on the caller. | Must |
| DB-02 | **Home** is the overview: the Home's headline numbers, what is pending, and entry points to each module. | Must |
| DB-03 | Every member's dashboard shows the Home's full financial relationships — owed to and owed by, for everyone — not only their own. | Must |
| DB-04 | A Co-Admin's dashboard adds operational controls: pending approvals, member requests, expense approvals, chore confirmations, absence requests. | Must |
| DB-05 | An Admin's dashboard adds governance: rules, Home settings, AI settings, settlement, member removal, History. | Must |
| DB-06 | A universal quick-add control offers, for a member: Expense, Meal, Chore done, Absence. For an Admin it additionally offers Chore, Rule and Category. | Must |
| DB-07 | An Announcements panel on Today shows time-boxed, broadcast-only messages from Admins (members cannot create). **new** | Must |

### 6.13 Insights (IN, replacing AN)

| ID | Requirement | Priority |
|----|-------------|----------|
| IN-01 | One Insights screen with a period filter (Day, Week, Month), a category filter, a person filter and a type filter (Money, Chores, Food, Home). | Must |
| IN-02 | Money: spending by category, spending over time, who paid, paid versus fair share, owed-to and owed-by. | Must |
| IN-03 | Chores: workload by member, completed, missed, confirmed, pending, completion rate. Presented as contribution rather than competition in a Family Home. | Must |
| IN-04 | Food: home-cooked versus outside, food spending, most-liked meals, recently eaten, frequently repeated. | Must |
| IN-05 | Home: activity level, pending decisions, workload imbalance. | Must |
| IN-06 | Per-category monthly budgets with alerts when spending approaches or exceeds the cap. | Should |
| IN-07 | Every view is exportable as CSV. | Must |
| IN-08 | Insights is one screen with filters, not a page per report. | Must |
| IN-09 | A **household financial position** view: expected contribution against actual, fair share against paid, the Home's surplus or shortfall for the period, and the reserve balance with its movements. This is the Money answer to "where do we stand", distinct from the ledger of entries. **new** | Should |
| IN-10 | **Data portability is permanent.** Every member can export their own records and the Home's records — expenses, splits, settlements, assignments, points, meals, decisions and rules — as CSV, plus a settlement statement as PDF. This capability is never removed, never rate-limited and never placed behind a tier. **new** | Must |

### 6.14 Notifications (NT)

| ID | Requirement | Priority |
|----|-------------|----------|
| NT-01 | One notification system covering chores, money, food, people, approvals and system events. | Must |
| NT-02 | A chore reminder arrives before its window opens, timed to when the member is actually home. | Must |
| NT-03 | Escalation on a missed chore: a private reminder, then a Home-visible entry, then the consequence. | Must |
| NT-04 | A weekly digest reaches the Home: standing, fairness summary, next week's plan. | Must |
| NT-05 | Members can configure which categories they receive and set quiet hours. Settlement cannot be muted. | Must |
| NT-06 | Confirmation requests are pushed to the members whose confirmation the quorum requires. | Must |
| NT-07 | A pending decision notifies exactly the people whose response it requires, and reminds them before the deadline. **new** | Must |
| NT-08 | Every member sees every device notifications reach them on, and can remove one without affecting the others. | Should |

### 6.15 Intelligent assistance (AI)

The application must be fully functional with no LLM configured. Every feature
below degrades to a deterministic path.

| ID | Requirement | Priority |
|----|-------------|----------|
| AI-01 | AI configuration belongs to the Home: provider, model and key, entered by the Admin and stored encrypted server-side. | Must |
| AI-02 | AI capabilities are individually switchable: food suggestions, new meal ideas, weekly summary, natural-language entry, rule parsing, schedule proposals. | Must |
| AI-03 | An **AI Router** dispatches to the configured provider through a provider adapter. Call sites know nothing about providers. | Must |
| AI-04 | A weekly fairness summary in plain language. | Should |
| AI-05 | LLM-assisted schedule generation, validated against every hard constraint before use, falling back to the deterministic solver on any violation. | Should |
| AI-06 | Natural-language entry for expenses, absences, meals and rules. Every result is a draft the user confirms. **extended** | Should |
| AI-07 | Rule parsing: plain text into a structured proposal for human review. **new** | Should |
| AI-08 | Food ideas: two new meal suggestions generated from the Home's structured context. **new** | Should |
| AI-09 | **AI is never authoritative over Money, Permissions, Rules, Approvals, Chore calculation or Settlement.** Every structured output is validated before use. | Must |
| AI-10 | Only member identifiers and first names are sent. No phone numbers, email addresses, payment identifiers, full names or Home address. | Must |
| AI-11 | Every LLM call is logged with input, output, validation result and token usage. | Must |
| AI-12 | The deterministic core — login, Home switching, members, roles, permissions, availability, chore assignment, points, absence, expense calculation, splits, balances, settlement, approvals, voting, rule storage, notifications, calendar, food library, food voting, analytics — works with no LLM, always. | Must |

---

## 7. The governance matrix

Defaults. Each row is configurable in Home settings; the shape is not.

| Action | Member | Co-Admin | Admin | Shared requirement |
|--------|:------:|:--------:|:-----:|--------------------|
| Add expense | Yes | Yes | Yes | No |
| Add meal | Yes | Yes | Yes | No |
| Rate food | Yes | Yes | Yes | No |
| Mark own chore done | Yes | Yes | Yes | No |
| Confirm someone's chore | Yes | Yes | Yes | Quorum by Home size (CE-03) |
| Approve an expense | Yes | Yes | Yes | One non-payer approval above threshold |
| Create or edit a category | No | Yes | Yes | No |
| Request an absence | Yes | Yes | Yes | Yes — approval required to excuse chores |
| Approve an absence | Yes | Yes | Yes | Policy |
| Request to join | — | — | — | Yes — acceptance required |
| Accept a member | No | Yes | Yes | Policy |
| Create a rule | No | No | Yes | Co-Admin + member acknowledgement |
| Modify a rule | No | No | Yes | Co-Admin + member acknowledgement |
| Close settlement | No | Acknowledge | Initiate | Required |
| Reopen settlement | No | Acknowledge | Initiate | Required |
| Balance adjustment | No | Acknowledge | Initiate | Required |
| Set or change an expected contribution | No | Acknowledge | Initiate | Required |
| Create a reserve | No | Acknowledge | Initiate | Required |
| Draw from the reserve | No | Acknowledge | Initiate | Required |
| Remove a member | No | Acknowledge | Initiate | Required |
| Change governance policy | No | Acknowledge | Initiate | Required |
| Change Home type or money mode | No | Acknowledge | Initiate | Required |
| Configure AI | No | No | Yes | Governance acknowledgement |

**The rule this table exists to encode:**

> No critical financial, membership, settlement or governance decision may be
> completed by one person alone when the Home's policy requires shared
> acknowledgement or approval. The Admin is responsible for initiating and
> managing the process. The Admin is not an unchecked superuser.

---

## 8. Navigation

Primary, always visible:

```text
Home    Today    Chores    Money    Food    Insights
```

More, for the rarely used:

```text
Members    Calendar    Approvals    Rules    Categories
Home settings    AI settings    History
```

One exception: **Approvals is promoted out of More whenever anything is
pending**, with its count. Hiding a queue of decisions in a submenu is how a
Home stops deciding things.

A universal `+` offers Expense, Meal, Chore done and Absence to a member, and
additionally Chore, Rule and Category to an Admin.

Daily, weekly and monthly reports are **not** separate destinations. They are
filters inside the module they belong to.

---

## 9. Key user journeys

**J1 — Create a Home (Admin, once, about 15 minutes).** Create the Home, choose
its type, set its location and timezone, review the default chore templates and
categories, optionally add a provider key for AI, generate the invite link and
share it.

**J2 — Join a Home (about 2 minutes).** Open the link, sign in or sign up, tap
"Request to join", wait. The Home sees a Requested entry. Someone with
permission accepts. Set presence for the week. Enable notifications.

**J3 — A chore, start to finish.** Sunday evening the schedule generates. Monday
a push arrives, timed to when the member is actually home. They do it, tap Done,
attach a photo. The confirmation request goes to the people the quorum needs.
They confirm, points post. If nobody responds, the clock confirms it.

**J4 — Logging an expense.** Amount, category, save. Under the threshold it
enters the ledger immediately and everyone sees it, including their own share.

**J5 — Recording a meal.** "+ Meal" → name (offered from the library), source,
items, costs, who ate. Save. Optionally save to the library, optionally link it
to the ₹680 expense already logged, optionally rate it.

**J6 — Tonight's food.** Open Food. Two suggestions from the Home's own library
with per-person cost, and two AI ideas clearly marked as new. Pick one, or
ignore both and type what was actually eaten.

**J7 — Closing the month.** The Admin starts "Close August". The system computes
the settlement. The Co-Admin reviews and acknowledges. The required members
acknowledge. Only then does it close, and everyone gets their payment
instruction with a UPI link. If an acknowledgement never comes, the decision sits
at `Waiting` and nothing changes.

**J8 — Writing a rule.** The Admin types "Nobody should leave unwashed vessels
overnight. If someone does, they clean the kitchen next morning." AI proposes:
condition — unwashed vessels at end of day; action — clean kitchen next morning;
applies to — the person responsible; penalty — none. The Admin edits the wording,
submits it. Co-Admin acknowledges, members acknowledge, the rule goes live as
version 1.

**J9 — Someone leaves.** The Admin proposes removal. Co-Admin acknowledges,
members approve. The system checks the money: ₹1,240 outstanding. The member
becomes `Inactive`, flagged pending settlement, keeps appearing in the money
views until it clears, and is removed automatically when it does. Their history
stays.

**J10 — A late expense.** Three days after the July close, someone finds a ₹900
receipt dated 18 July. Logging it flags the closed period and offers two paths:
carry it into August as a tagged adjustment split against July's membership, or
open a Critical decision to reopen July. Carry-forward needs no decision;
reopening does.

---

## 10. Success metrics

Measured after three full months of use.

| Metric | Baseline | Target |
|--------|----------|--------|
| Share of total effort points earned by the top 3 members | About 100% | Below 45% |
| Members with zero recorded effort in a month | 4–5 | 0 |
| Chore completion rate against schedule | Not measured | Above 80% |
| Members who logged at least one expense in the month | 3 | At least 6 |
| Time to close a month | Hours of argument | Under 10 minutes of decision time |
| Expenses discovered after close and lost | Non-zero | 0 |
| **Meals recorded per week** | 0 | At least 5 |
| **Suggestions accepted from the Home's own library** | — | At least 2 per week |
| **Critical decisions completed with every required response** | — | 100% |
| **Critical decisions completed by one person alone** | — | 0 — this must be structurally impossible |
| Weekly active members | — | All of them |

The first metric remains the most important. If effort concentration does not
fall, the product has failed regardless of how good the food module is. The
second most important is the last-but-one: a Critical decision that completes
without its required responses is not a bug in a feature, it is the governance
model not existing.

---

## 11. Constraints, assumptions and risks

**Constraints**

- Zero hosting budget. Every runtime component must sit inside a free tier.
- The interface must be genuinely well designed. Abandonment destroys the data
  set the entire product depends on.
- One timezone and one currency (INR) per Home in version 2. Multi-currency support (each expense with its own currency, exchange-rate conversion to the Home's base currency) is deferred to version 3.
- Complexity is a backend concern. The interface shows Approve, Reject,
  Acknowledge, Done, Owe, Paid, Rule — never the machinery underneath.

**Assumptions**

- People will install a home-screen web app and grant notification permission.
- People log their presence honestly. The system does not verify it.
- Food entry is optional and will be inconsistent. The recommender must work
  from sparse data and improve as it fills in.
- Payments are settled outside the app and marked honestly.

**Risks**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Governance makes the app bureaucratic | Nothing gets decided; people stop using it | Three levels, not one. Most actions are Normal and need nothing. Acknowledgement, not approval, wherever a veto is not appropriate. Approve All for everything the caller may legitimately batch. |
| A required acknowledgement never arrives | A decision stalls forever | Decisions have deadlines and lapse. The Admin can re-propose. Pending decisions are surfaced in navigation, not buried. |
| Food entry is never done | The recommender has nothing to work from | Food is optional by design, entry is three fields, the library removes retyping, and suggestions degrade gracefully to "not enough history yet" rather than inventing. |
| AI writes something authoritative | A rule, an expense or a schedule the Home did not agree to | Structural: AI output is always a proposal, always validated, and never a write path. Rules, money and permissions have no AI-authored path at all. |
| Members dispute point weights | The schedule is contested and ignored | Weights are visible, and changing them is a governed decision the Home participates in rather than an admin edit. |
| Confirmation quorum stalls in a small Home | Points never post | Quorum scales down to one other person, and auto-confirm still applies at every size. |
| Free-tier database pauses through inactivity | Outage | A scheduled weekly heartbeat keeps the project active. |

---

## 12. Competitive position

The full analysis lives in [`Competitor_Analysis.txt`](Competitor_Analysis.txt)
and is mapped requirement by requirement in
[16-COMPETITIVE-POSITIONING.md](16-COMPETITIVE-POSITIONING.md). That document is
the authority; this section is the summary a product reader needs.

**The seven gaps the analysis identifies across the whole competitive set** —
shared governance, work and money joined into one picture, absence fairness,
verified work, explained financial relationships, food intelligence, and AI that
is optional rather than depended on — are the seven HouseOS is built around.
Each is carried by requirements in section 6 of this document, and each is
listed with its carrier in 16-COMPETITIVE-POSITIONING §4.

| Capability | HouseOS | What the analysis records about the competitive set |
|------------|---------|------------------------------------------------------|
| Shared governance — roles, approvals, acknowledgement, quorum, rule history | GV-01…12, AP-01…06, RL-01…10 | "Nobody in this set really makes Admin + Co-Admin + Members + approvals + acknowledgement + voting + rule history a central system." Homsy and Flatastic have individual member accounts; Homee is described as newly launched and lacking multi-stage approvals. |
| Work and money joined — effort deficit converts to money and settles | EF-04, EF-05, ST-03 | Competitors "generally manage either chores → points **or** expenses → debts". Flatastic and Homsy hold both chores and expenses, but the analysis does not record either connecting the two. |
| Absence-aware chore fairness | AV-04…08 | A proper "I'm away → house approves → my workload is removed without unfair carry-forward" system is called "unusual" in this set. Not recorded for any competitor. |
| Verified work — confirmation before points post | CE-02…06 | The analysis contrasts this with "I clicked Done", which is what it records competitors as doing. |
| Explained financial relationships, visible to everyone about everyone | EX-09…12, IN-02, IN-09 | Splitwise and Tricount are the benchmarks for balances and settlement, but the analysis's point is that they give the number without the household context — the Home, members, chores, food, approvals and rules that produced it. |
| Food as a costed, preferenced library feeding a recommender | FD-01…20, 15-FOOD-SPEC | Homsy, Cozi and FamilyWall have meal planning, and Homsy and Cozi have recipes. The analysis's gap is that none builds the Home's own costed food history — likes, dislikes, cost, frequency, location — into a recommender. |
| AI optional, never authoritative | AI-01…12, 10-LLM-SPEC | "No product in the set is positioned this way." Every deterministic path in HouseOS works with no key configured anywhere. |

**Where competitors are ahead, and we say so.** Three capabilities in the set
are real and we do not have them in version 2: multi-currency (Tricount),
the grocery/shopping list (Homsy, Flatastic, Cozi, FamilyWall) and offline
writes (Homsy). Each is deferred with its exposure stated in
16-COMPETITIVE-POSITIONING §5.3 and scheduled in
[07-ROADMAP.md](07-ROADMAP.md), not treated as unimportant.

**The discipline the analysis imposes.** Its own instruction is: *do not beat
the broad competitors by adding more features.* Every requirement added to this
document because of the analysis closes a specific recorded gap or answers a
specific recorded complaint. Section 4.3 states the four commitments that come
from complaints rather than from features.
