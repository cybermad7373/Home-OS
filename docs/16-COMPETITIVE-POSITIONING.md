# 16 — Competitive Positioning

**Product:** HouseOS
**Version:** 2.0
**Date:** 2026-08-27
**Source:** [`Competitor_Analysis.txt`](Competitor_Analysis.txt)

---

## 0. What this document is, and is not

This document maps every capability and complaint recorded in
[`Competitor_Analysis.txt`](Competitor_Analysis.txt) onto HouseOS requirements.
For each competitor capability it states one of four verdicts, and names the
requirement that carries it.

| Verdict | Meaning |
|---|---|
| **Covered** | A requirement already exists that does this. |
| **Covered better** | A requirement already exists, and the competitor's recorded weakness is something our design specifically avoids. |
| **Added** | A gap the competitor analysis exposed. A new requirement was written for it. |
| **Deliberately not built** | A real competitor capability we are choosing not to build, with the reason and the review trigger stated. |

It contains no competitor claim that is not in `Competitor_Analysis.txt`, and no
HouseOS claim that is not carried by a requirement in
[`01-BRD.md`](01-BRD.md) or a rule in a numbered specification. Where the
analysis records a user complaint rather than a product fact, it is written as a
complaint.

This document does not create requirements by itself. Every **Added** row points
at a requirement ID that lives in `01-BRD.md` and is scheduled in
[`07-ROADMAP.md`](07-ROADMAP.md).

---

## 1. The competitive set

Nine products, in the order `Competitor_Analysis.txt` ranks them for study.

| # | Competitor | Its category | Why it matters to us |
|---|---|---|---|
| 1 | **Homsy** | Broadest all-in-one household organiser | Closest overall competitor; the breadth benchmark |
| 2 | **Flatastic** | Shared-flat chores + expenses + shopping | The roommate model closest to our own house |
| 3 | **Sweepy** | Cleaning and workload specialist | The chore-scheduling and workload-UX benchmark |
| 4 | **Nipto** | Gamified chore points | The points/motivation benchmark |
| 5 | **Splitwise** | Expense splitting and settlement | The money benchmark |
| 6 | **Tricount** | Simple shared expenses, multi-currency | The settlement-simplicity benchmark |
| 7 | **Cozi** | Family calendar, lists, recipes | The family-organiser benchmark |
| 8 | **FamilyWall** | Very broad family ecosystem | The cautionary example on breadth |
| 9 | **Homee** | New, narrow shared-chore scheduler | Validates the category; not yet a threat |

The analysis positions the field on two axes: household breadth (Homsy,
FamilyWall, Flatastic lead) and money depth (Splitwise, Tricount lead). HouseOS
targets high money depth **plus** chores, governance and food — a position no
product in the set occupies.

---

## 2. Coverage matrix — competitor capabilities

Every capability `Competitor_Analysis.txt` credits to a competitor.

### 2.1 Chores and work

| Capability | Held by | Verdict | HouseOS carrier |
|---|---|---|---|
| Recurring chore/task definitions | Homsy, Flatastic, Sweepy, Nipto, Homee | Covered | CH-01, CH-05 |
| Automatic chore rotation / alternating assignment | Homsy, Flatastic | Covered better | CH-06 distributes **effort points**, not chore count; CH-07 avoids repeating a heavy chore in consecutive weeks |
| Automatic workload distribution | Sweepy | Covered better | CH-06 plus EF-01 targets, constrained by real presence (AV-01…03) rather than a flat rota |
| Tracks when a task was last done | Sweepy | **Added** | **CH-12** |
| Shared household chore calendar | Homee, Homsy | Covered | CL-01…04 |
| Shared responsibility / participation | all five chore products | Covered | CH-11, EF-03 |
| Customised chores | Nipto | Covered | CH-01, CH-02 |
| Splitting work between collaborators | Nipto | **Added** | **CE-11** |
| Task completion in one action | Nipto (its recorded weakness) | **Added** | **CE-12** |
| Reminders | Nipto, Sweepy | Covered | NT-02, and availability-aware timing |
| Streaks | Homee | **Added**, optional | **EF-08** |
| Points made visible | Flatastic, Nipto | Covered better | EF-03 shows earned, target and running carry — a position, not just a score |
| Bonus points | Nipto | Covered | Rules with a points weight, RL-10 |
| Weekly winners / competition mode | Nipto | **Deliberately not built** — see §5.1 |
| Personal-goal mode | Nipto | Covered | EF-01 weekly target is exactly a personal goal; the Family Home presents it non-competitively (5.2) |
| Rewards | Nipto | **Deliberately not built** — see §5.1 |
| Subtasks, comments, projects on tasks | Homsy | **Deliberately not built** — see §5.2 |

### 2.2 Money

| Capability | Held by | Verdict | HouseOS carrier |
|---|---|---|---|
| Fast expense entry | Splitwise | Covered | EX-01, under ten seconds |
| Group balances, who-owes-whom | Splitwise, Tricount, Flatastic | Covered better | EX-10 shows every relationship to **everyone**, not only the caller's own position |
| Settlement | Splitwise, Tricount | Covered better | ST-03 reduces to the minimum number of member-to-member payments; ST-04 attaches a UPI deep link |
| Custom splits / unequal shares | Tricount; Flatastic's recorded gap | Covered better | EX-07 custom shares and exclusions, **plus** EX-05 rent split by room and EX-06 guest and dependent heads |
| Recurring expenses | Flatastic | Covered | EX-08 |
| Expense tracking inside the household product | Homsy, Flatastic, FamilyWall | Covered | EX-01…12 |
| Budgeting rather than a bare ledger | Flatastic's recorded gap; FamilyWall | **Added** | **EX-13**, **EX-14**, **IN-09** |
| Expected monthly contribution | Flatastic's recorded gap | **Added** | **EX-13** |
| Surplus and reserve/savings fund | Flatastic's recorded gap | **Added** | **EX-14** |
| Multiple currencies | Tricount; Flatastic's recorded gap | **Deliberately deferred** — see §5.3 |
| Export of financial data | Tricount (its removal is the complaint) | Covered better | IN-07 CSV, and **IN-10** guarantees it is never withdrawn |

### 2.3 Food, calendar, lists

| Capability | Held by | Verdict | HouseOS carrier |
|---|---|---|---|
| Meal planning | Homsy, Cozi, FamilyWall | Partially covered; forward planning **Added** as optional | FD-01…19 record and suggest; **FD-20** places a chosen suggestion on a future date |
| Recipes | Homsy, Cozi | **Deliberately not built** — see §5.2 |
| Recipe folders and categories | Cozi's recorded gap | Not applicable — we build no recipe store |
| Grocery / shopping list | Homsy, Flatastic, Cozi, FamilyWall; requested by Nipto users | **Deliberately deferred** — see §5.3 |
| Grocery budgeting | Homsy's recorded gap | Partially covered by IN-06 per-category budgets; the pantry itself is out of scope |
| Shared family/household calendar | Cozi, Homsy, FamilyWall, Homee | Covered | CL-01…05 |
| Calendar customisation | Homsy's recorded gap | Covered | CL-01 Day/Week/Month, and IN-01 filters by period, category, person and type |
| Photos and documents | FamilyWall | Partially covered | Receipt images on expenses (EX-01) and photo evidence on chores (CE-01). No general document store — see §5.2 |
| Location | FamilyWall; Homsy | Covered narrowly and deliberately | HM-03 stores the Home's location as context for food suggestions and nothing else; FD-19 forbids asserting restaurant availability |

### 2.4 Platform and accounts

| Capability | Held by | Verdict | HouseOS carrier |
|---|---|---|---|
| Individual accounts per household member | Homsy | Covered better | HM-04…10; a person holds a role **per Home** and may belong to many Homes |
| Web + mobile | Homsy, Cozi | Covered in sequence | Product phase 1 is web/PWA; product phase 2 is native Android/iOS (BRD §1) |
| Multi-device synchronisation | Homsy | Covered | Server-authoritative state; NT-08 and NOTIFICATIONS §7 manage per-device registration |
| Offline use | Homsy ("offline-first"); Sweepy's recorded failures | Partially covered, honestly — see §5.3 |
| Multiple family groups | FamilyWall | Covered | HM-04 |

---

## 3. Competitor weaknesses turned into commitments

Each row below is a complaint recorded in `Competitor_Analysis.txt` and the
HouseOS commitment that answers it. These are commitments, not features: they
constrain how the features above are allowed to behave.

| # | Commitment | Answers | Carried by |
|---|---|---|---|
| **C-01** | Core recording is never rate-limited, capped or paywalled. Logging an expense, a chore or a meal has no daily limit and no waiting period. | Splitwise: free users limited to a few expenses per day, with waiting periods before adding another | **BRD §4.3**, NFR-13 |
| **C-02** | Data portability is a permanent guarantee, not a feature that may be withdrawn. CSV of every view, plus a full-history export. | Tricount: export and the web version were removed | **IN-10**, NFR-14 |
| **C-03** | A recorded expense is never silently lost. Writes are confirmed against the server before the UI reports success; an offline write fails visibly and stays retryable. | Tricount: expenses apparently disappearing after entry; Sweepy: sync problems | NFR-15, TRD NFR-05, ARCHITECTURE §8, E-25, E-45 |
| **C-04** | Recurrence and date evaluation happen in the Home's timezone, with timestamps persisted in UTC. A chore never rolls to the next day early. | Flatastic: chores jumping to the next day too early | HM-01, AGENTS.md domain rule, ALGORITHMS date handling |
| **C-05** | Financial presentation is a position, not a ledger dump: expected contribution, fair share, net, surplus, reserve. | Flatastic: presentation too ledger-oriented; user wanted contribution, surplus, reserve, budgeting | **EX-13**, **EX-14**, **IN-09**, EX-10, ST-03 |
| **C-06** | Splitting is customisable per expense and structurally aware of rooms, guests and dependents. | Flatastic: custom splitting historically limited; a user needed unequal rent and subscription shares | EX-04…07 |
| **C-07** | Completing work is one action from the screen the member is already on. Confirmation happens after the fact and never blocks the tap. | Nipto: completion buried behind a "Validate" flow | **CE-12** |
| **C-08** | Point arithmetic is inspectable. A member can see why they have the points they have. | Nipto: scores reported as not updating correctly; transparent point calculation requested | EF-03, EF-06, **EF-09** |
| **C-09** | Notification delivery is guaranteed in-app even when push fails. Every notification writes a feed row first; one dead device never suppresses the others. | Nipto and Sweepy: notification reliability reported as inconsistent | NOTIFICATIONS §1, §8, and its "feed guarantee" test |
| **C-10** | Consequences for missed work are governed and monetary, not a hidden score deduction. | Nipto: users asking for easier negative points, and premium limits that were unclear | EF-04, EF-05, EF-07, CE-07 |
| **C-11** | Setup is conservative by default. Default templates produce a workload a real home can meet, and the Home can add more once it is running. | Sweepy: setup overwhelming because default workload/frequency is too aggressive | **HM-20** |
| **C-12** | Breadth is earned, not piled into the navigation. Six primary destinations; everything else lives in More; reports are filters, not destinations. | FamilyWall: breadth makes a family app feel like a collection of utilities | BRD §8, IN-08 |
| **C-13** | Premium boundaries are not inconsistent, because there is no premium tier and no advertising in the product. | Cozi: intrusive premium promotion, and some features paywalled while others are not | **BRD §4.3** |
| **C-14** | Governance is central, not absent: roles, approvals, acknowledgements, quorum, rule history. | The analysis records that no product in the set makes shared governance central | GV-01…12, AP-01…06, RL-01…10, 14-GOVERNANCE-SPEC |

---

## 4. Advantages no competitor in the set has

Claimed only where a requirement already carries them. These are the reasons to
choose HouseOS over any product above.

| # | Advantage | Why competitors do not have it | Carrier |
|---|---|---|---|
| **A-01** | **Shared governance as the operating model.** Admin initiates, Co-Admin acknowledges, members approve; nothing critical completes alone; every response is kept forever. | The analysis states plainly that nobody in the set makes admin/co-admin/approvals/acknowledgement/voting/rule history a central system. | GV-01…12, BRD §7 |
| **A-02** | **Work and money are one picture.** Effort deficit converts to money at a rate the Home itself agreed, credited to the members in surplus, exactly balanced. | Competitors do chores→points **or** expenses→debts. None joins them. | EF-04, EF-05, ST-03 |
| **A-03** | **Absence fairness.** A declared, approved absence removes the affected chores with no penalty and no carry-forward, while merely being busy changes *which* chores you get and never *how many points you owe*. | The analysis calls a proper absence system unusual in this set. | AV-04…08, and design decision 2 in `00-INDEX.md` |
| **A-04** | **Verified work.** Points post only after peer confirmation by a quorum sized to the Home, never by the person who did it, with silence auto-confirming so non-participation cannot become a veto. | Competitors record "I clicked Done". | CE-02…06, D-43 |
| **A-05** | **Explained financial relationships.** Not "you owe ₹500" but which approved expenses and adjustments produced it, visible to everyone about everyone. | Splitwise and Tricount give the number; the household context is not theirs to give. | EX-09…12, IN-02 |
| **A-06** | **Food as a costed, preferenced module.** Named meals with items, source, costs and participants, a deduplicated Home library, per-person and Home-level preference, and a deterministic recommender that answers "what do we eat" from the home's own history before any model is asked. | Competitors offer recipes and meal calendars. None builds the Home's own costed food history into a recommender. | FD-01…19, 15-FOOD-SPEC |
| **A-07** | **AI that is optional and never authoritative.** Every deterministic path works with no key configured anywhere; the LLM proposes and the rule engine disposes. | No product in the set is positioned this way. | AI-01…12, 10-LLM-SPEC |
| **A-08** | **Multi-Home with per-Home roles.** One account, many Homes, a different role in each. | FamilyWall has multiple family groups; the per-Home role model is ours. | HM-04, 5.1 |
| **A-09** | **Immutable closed periods with governed reopening.** A closed month cannot be quietly edited; a late expense posts forward as a tagged adjustment against the membership as it stood. | Not present in the set. | ST-06…08, D-02 |

---

## 5. What we deliberately do not build, and when to revisit

### 5.1 Competitive gamification — weekly winners, rewards

Nipto's strength is competition: weekly winners, rewards, bonus points. We do
not build a winner or a reward store.

**Reason.** The analysis also records the cost: Nipto's gamification "can feel
simplistic", and its penalty mechanics — the part that actually enforces — are
what users ask to be made easier. HouseOS already has a stronger consequence
than a badge: an effort deficit becomes money at a rate the Home agreed to
(EF-04). Layering a prize on top of a settlement obligation weakens the
settlement obligation. And in a Family Home the analysis's own lesson applies in
reverse — 5.2 already specifies the leaderboard as "a contribution view, not a
competitive ranking".

**What we take instead.** The motivating parts that do not compete with the
money mechanism: visible standing (EF-03), optional streaks that are
recognition only and carry no points (EF-08), and transparent point arithmetic
(EF-09).

**Revisit if.** Effort concentration (BRD §10, first metric) fails to fall
below 45% in three months **and** the recorded reason is motivation rather than
disputed fairness.

### 5.2 Recipes, subtasks, comments, a general document store

| Not built | Held by | Reason | Revisit if |
|---|---|---|---|
| Recipe store with steps and measurements | Homsy, Cozi | 15-FOOD-SPEC §1.1 is explicit: meal items exist so that cost, preference and later nutrition can be reasoned about; they are "not a recipe engine and there are no measurements to validate". Cozi's own recorded complaint is that its recipe store lacks folders and categories — the organisation problem arrives with the feature. | The Home library's own reuse rate is high and members ask for preparation notes. A note field on a library entry is the cheap first step, not a recipe engine. |
| Subtasks, comments and projects on tasks | Homsy | A chore is a unit of measured effort with a point weight; splitting it into subtasks makes the point weight meaningless and the quorum ambiguous. Homsy's users asking for *more* granular organisation is evidence that generic task management pulls a household app towards being a project tool. | Chores routinely need to be handed over mid-way. CE-11 shared assignment covers the real case (two people did it) without subtasks. |
| General document and photo store | FamilyWall | Receipts (EX-01) and chore evidence (CE-01) are the two cases with a record-keeping purpose. A general store has storage cost, retention questions and no household rule attached to it. | Not scheduled. |
| Chat or messaging | — | Already a BRD non-goal: the home has a group chat and duplicating it adds noise. | Not scheduled. |

### 5.3 Deferred with a stated competitive risk

These three are real competitor capabilities we do not have. Each is an
acknowledged competitive exposure, not an oversight.

| Deferred | Competitive exposure | Current position | Trigger to build |
|---|---|---|---|
| **Multi-currency** | Tricount handles currencies well and is praised for it. A Flatastic user reported the single-currency limit made the app **unusable** for their situation. | One currency per Home, INR, stated in BRD §11 and in the TRD non-goals. Deferred to version 3: per-expense currency plus conversion to the Home's base currency. No currency symbol or date format is hard-coded (NFR-12), so the deferral is a data-model change, not a UI rewrite. | Any target Home has members settling in more than one currency. This is a hard blocker for that Home, not a degradation. |
| **Grocery / shopping list** | Held by Homsy, Flatastic, Cozi and FamilyWall — four of the nine — and explicitly requested by Nipto's users. The analysis calls Flatastic's shopping list "a strong everyday feature". | A BRD non-goal for version 2, reclassified from "deliberately deferred" to **planned post-v2** with this evidence attached. Meals reference items; the pantry is not modelled. | Scheduled for the first post-v2 milestone. The competitor evidence is strong enough that this should not be re-argued, only sequenced. |
| **Offline writes** | Homsy positions on offline-first. | Read-only offline shell. Mutations fail visibly and stay retryable; nothing is queued (TRD NFR-05, ARCHITECTURE §8, E-25). | A write queue needs an explicit idempotency and conflict contract first. **This constraint is itself C-03**: Tricount's complaint is that entries silently vanished. A queue that loses or double-posts an expense is worse than an honest failure. Build the contract, then the queue. |

---

## 6. The positioning sentence

> Competitors organise a household. HouseOS runs one: it records the work, the
> money and the food; it verifies the work before it counts; it turns unpaid
> effort into settled money at a rate the home itself agreed to; and it makes
> the decisions that govern all of it require more than one person.

The analysis's own instruction is the discipline this document enforces: **do
not beat the broad competitors by adding more features.** Every **Added** row in
§2 exists because it closes a specific recorded gap or answers a specific
recorded complaint — not because a competitor's listing has the word on it.

---

## 7. Review obligation

This document is reviewed whenever `Competitor_Analysis.txt` is updated, and at
each product-phase gate. A review checks four things:

1. Every capability in the source analysis appears in §2 with a verdict.
2. Every **Added** verdict still points at a live requirement ID in `01-BRD.md`
   that is scheduled in `07-ROADMAP.md`.
3. Every commitment in §3 is still carried by the rule or requirement named.
4. Every advantage in §4 is still carried by a requirement. An advantage whose
   requirement was cut is deleted from §4, not softened.
