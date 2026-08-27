# 12 — Test Plan

**Product:** HouseOS
**Version:** 2.0
**Date:** 2026-08-27

What is tested, at which level, and the specific cases that must pass before each phase ships. Test IDs are referenced from the roadmap's definition of done.

## Implementation status

**This is the specification-2.0 target, not an inventory of the suite.** The
counts in section 1 include the governance, rules, food, calendar and insights
tests that phases 10 to 15 will add.

What exists on 2026-08-27, against specification 1.0:

| | Files | State |
|---|---|---|
| Unit and property (`tests/unit/`) | 26 | 455 tests passing on 2026-08-27, with the integration suites skipped |
| Integration (`tests/integration/`) | 11 | Run by `npm run test`. Until 2026-08-27 these ran against the hosted project; the target is now a local `supabase start` stack, and the hosted project is written to only by an explicitly requested `db:push` (D-59) |
| End-to-end (`tests/e2e/`) | 1 — `foundation.spec.ts` | Run by `npm run test:e2e`; the phase-1 journey only |
| Edge Function (`supabase/functions/_shared/`) | Deno tests | Run by `npm run test:functions` |

`npm run test` reported 455 passing and 56 skipped at the last recorded run.
The skips are whole suites that gate themselves on unapplied migrations —
`llm-credentials` on 045, `governance` on 051 to 053, and `chore-quorum` on
054 — a state of the environment, not a failure. The per-phase counts in
`PROGRESS.md` are the authority on what has actually run; this document is the
authority on what must eventually pass.

**A skipping suite is not a passing suite.** Fifty-six of those assertions are
the database half of phases 9, 10 and 11, and none of them has been observed to
pass anywhere. Standing up the local stack and applying migrations 045 to 054
is therefore the next piece of work, ahead of further features (D-59), and from
phase 11 onward a phase is not done until its own integration suite has run
against a database rather than gated itself out.

**The largest open gap is E2E.** Section 4 calls for twenty-two journeys and
one exists. Every journey past phase 1 is currently covered only at the unit and
integration levels — which leaves the route handlers and the screens, the layer
between the domain and the database, with no automated coverage of any kind.
From phase 11 onward each phase writes one journey through its own main path as
part of the phase (D-59), rather than leaving all twenty-two to a final pass.

---

## 1. Strategy

```
        ╱╲          E2E (Playwright) — 22 tests
       ╱  ╲         the critical journeys, on real Chrome
      ╱────╲
     ╱      ╲       Integration — ~150 tests
    ╱        ╲      API routes against a local Supabase, RLS and triggers
   ╱──────────╲
  ╱            ╲    Unit — ~320 tests
 ╱──────────────╲   pure domain functions: split, netting, targets, constraints,
                    quorum, decision resolution, food recommendation
```

The shape is deliberate. The product's correctness lives almost entirely in seven pure functions — the split calculator, the netting algorithm, the target calculator, the constraint validator, the quorum calculator, the decision resolver and the food recommender. Those get exhaustive unit and property testing. Everything above them is thinner because there is less that can go silently wrong.

Version 2.0 shifts one thing about that balance. **Governance is the first part
of the product whose most important guarantee is a negative** — that something
cannot happen — and a negative is not provable by a happy path. The decision
tests are therefore weighted towards property tests and towards integration tests
that attack the database directly with the service-role key, because "the route
handler refuses it" is not the claim being made.

| Level | Tool | Runs |
|-------|------|------|
| Unit | Vitest | Every commit, under 10 seconds |
| Property | Vitest + fast-check | Every commit |
| Integration | Vitest + Supabase CLI local stack | Every commit |
| Database (RLS, triggers) | pgTAP or SQL assertions | Every commit |
| E2E | Playwright, mobile viewport (Pixel 5) | Pre-merge and pre-deploy |
| Accessibility | axe-core in Playwright | Pre-merge |
| Performance | Lighthouse CI | Pre-deploy |

**Non-negotiable gate:** the entire suite must pass with no LLM key configured — none in the environment and none stored against a house. That is run as a separate CI job, not as an afterthought.

---

## 2. Unit tests — domain logic

### 2.1 Split calculator (`T-SPL`)

| ID | Case | Expected |
|----|------|----------|
| T-SPL-01 | ₹1,200.00, 8 members, equal | Each ₹150.00, sum exact |
| T-SPL-02 | ₹1,240.00, 8 members, equal | Seven at ₹155.00, remainder distributed, sum exact |
| T-SPL-03 | ₹0.01, 8 members | One member 1 paisa, seven at 0, sum exact |
| T-SPL-04 | ₹1,240.00, 8 members + 1 guest hosted by Kumar | 9 heads; Kumar's row carries his own share plus the guest's |
| T-SPL-05 | ₹1,240.00, 2 guests both hosted by Kumar | 10 heads; Kumar carries three shares total |
| T-SPL-06 | Guest with `counts_for_expense = false` | Excluded from head count |
| T-SPL-07 | Rent ₹25,000, rooms of 3/3/2 | ₹3,000 / ₹3,000 / ₹3,500 per person, sum exact |
| T-SPL-08 | Rent with one vacant room | Vacant room's rent split equally across all members |
| T-SPL-09 | Member with no room, rent split | Excluded from rent, included in the vacant-room portion |
| T-SPL-10 | Room change mid-month | Rent prorated by days in each room |
| T-SPL-11 | Custom split summing correctly | Accepted as given |
| T-SPL-12 | Custom split summing incorrectly | Rejected with the difference stated |
| T-SPL-13 | Custom split naming a non-member | Rejected |
| T-SPL-14 | Expense dated before a member joined | That member excluded |
| T-SPL-15 | Expense dated after a member left | That member excluded |
| T-SPL-16 | Late expense against a closed month's membership | Uses that month's roster, not today's |
| T-SPL-17 | Single-member house | That member's share is the full amount |
| **T-SPL-P1** | **Property:** for amounts 1 to 100,000,000 paise and 1 to 30 heads | `Σ shares + Σ guest_shares == amount`, always |
| **T-SPL-P2** | **Property:** same input twice | Identical output, byte for byte |

### 2.2 Netting (`T-NET`)

| ID | Case | Expected |
|----|------|----------|
| T-NET-01 | Two members, one owes ₹500 | One payment of ₹500 |
| T-NET-02 | Eight members, one payer of everything | Seven payments, all to that payer |
| T-NET-03 | Eight members, two payers | At most seven payments, nets to zero |
| T-NET-04 | Everyone square | Zero payments |
| T-NET-05 | Circular debt (A→B→C→A) | Reduced; never a payment to oneself |
| T-NET-06 | One member's net is a single paisa | A ₹0.01 payment is created, not dropped |
| T-NET-07 | Penalties included | Deficit member's payment increases; surplus member's receipt increases |
| **T-NET-P1** | **Property:** any balance set summing to zero | Payments count ≤ n−1, and per-member in-minus-out equals their net |
| **T-NET-P2** | **Property:** any balance set | No payment has a non-positive amount |

### 2.3 Target calculator (`T-TGT`)

| ID | Case | Expected |
|----|------|----------|
| T-TGT-01 | 840 points, 8 members, all present | 105 each |
| T-TGT-02 | One member away 3 days | Their target is 4/7 of base; others rise proportionally |
| T-TGT-03 | Carry-in deficit of 85, cap 50% | Target rises by at most 52 |
| T-TGT-04 | Carry-in surplus of 60, cap 50% | Target falls by at most 52 |
| T-TGT-05 | Member away all week | Target 0; carry unchanged |
| T-TGT-06 | Member joined mid-week | Target prorated by remaining days |
| T-TGT-07 | `weekday_only` residency | Weekend days contribute zero presence |
| T-TGT-08 | Low availability, full presence | **Target identical to everyone else's.** The design's most contested rule, tested explicitly. |
| T-TGT-09 | Single member | Target equals the entire workload |

### 2.4 Availability windows (`T-AVL`)

| ID | Case | Expected |
|----|------|----------|
| T-AVL-01 | Leaves 09:30, returns 19:00 | Morning 06:00–09:30, evening 19:00–23:00 |
| T-AVL-02 | Home all day | One full window 06:00–23:00 |
| T-AVL-03 | `is_home = false` | No windows |
| T-AVL-04 | `away` exception | No windows, overriding the weekday pattern |
| T-AVL-05 | `home_all_day` exception on a working day | One full window |
| T-AVL-06 | `custom_hours` exception | Windows from the exception, not the pattern |
| T-AVL-07 | Leaves 06:10 | Morning window of 10 minutes, discarded as under 15 |
| T-AVL-08 | Returns 22:50 | Evening window of 10 minutes, discarded |
| T-AVL-09 | `weekday_only` member on Saturday | No windows regardless of the availability row |
| T-AVL-10 | Fit test: 60-minute chore in a 70-minute window | Does not fit (needs duration + 15 buffer) |
| T-AVL-11 | Fit test: 60-minute chore in an 80-minute window | Fits |
| T-AVL-12 | `any`-slot chore against a morning-only window | Fits |

### 2.5 Constraint validator (`T-CON`)

One test per hard constraint, each proving both acceptance and rejection.

| ID | Constraint | Positive and negative case |
|----|-----------|---------------------------|
| T-CON-01 | HC-1 availability | Fits accepted; no matching window rejected |
| T-CON-02 | HC-2 room scope | Occupant accepted; non-occupant rejected |
| T-CON-03 | HC-3 cooking skill | `can_cook` accepted; otherwise rejected |
| T-CON-04 | HC-4 presence | Present accepted; `away` rejected |
| T-CON-05 | HC-5 overlap | Non-overlapping accepted; overlapping rejected |
| T-CON-06 | HC-6 daily ceiling | Third chore accepted; fourth rejected; 150th minute accepted, 151st rejected |
| T-CON-07 | HC-7 guest eligibility | Guest and host accepted; anyone else rejected |
| T-CON-08 | HC-8 active membership | Active accepted; departed rejected |

### 2.6 Solver (`T-SOL`)

| ID | Case | Expected |
|----|------|----------|
| T-SOL-01 | 8 members, 50 instances, all available | Every instance assigned, max deviation ≤ 15 points |
| T-SOL-02 | One member available only at weekends | Every instance still assigned; that member gets weekend work and the same target |
| T-SOL-03 | No member can cook, cooking chores exist | Cooking instances marked `open`, everything else assigned |
| T-SOL-04 | Workload exceeds capacity | Assigns what fits, marks the rest `open`, returns a warning |
| T-SOL-05 | Room-scoped chores | Assigned only to that room's occupants |
| T-SOL-06 | Heavy chore done last week | Assigned elsewhere when an alternative exists |
| T-SOL-07 | Regeneration with confirmed work present | Confirmed assignments preserved; only outstanding ones move |
| T-SOL-08 | 30 members, 200 instances | Completes in under 5 seconds |
| **T-SOL-P1** | **Property:** 500 random availability configurations | No output ever violates HC-1 to HC-8 |
| **T-SOL-P2** | **Property:** any input | Every instance is assigned or explicitly `open`; none is dropped |

### 2.7 Penalties (`T-PEN`)

| ID | Case | Expected |
|----|------|----------|
| T-PEN-01 | 85-point deficit at ₹5/point | ₹425 owed |
| T-PEN-02 | Two in deficit, two in surplus | Pool distributed proportionally to surplus |
| T-PEN-03 | Nobody in surplus | Pool distributed equally across all members |
| T-PEN-04 | Nobody in deficit | No penalties, no credits |
| T-PEN-05 | Rate of zero (shadow mode) | Amounts compute and display as zero monetary effect |
| T-PEN-06 | Member joined mid-month | Deficit prorated by days of membership |
| T-PEN-07 | Bad week, good month | No penalty — the month's net is what counts |
| **T-PEN-P1** | **Property:** any deficit and surplus distribution | `Σ credits == Σ owed`, exactly |

### 2.8 Confirmation quorum (`T-QUO`) — **new in 2.0**

| ID | Case | Expected |
|----|------|----------|
| T-QUO-01 | One-person Home | Required 0; auto-confirmed on marking done |
| T-QUO-02 | Two-person Home | Required 1, no lead |
| T-QUO-03 | Three-person Home | Required 1, no lead |
| T-QUO-04 | Four-person Home | Required 2, lead needed |
| T-QUO-05 | Six-person Home | Required 2, lead needed |
| T-QUO-06 | Eight-person Home | Required 3, lead needed |
| T-QUO-07 | Policy `single` | Required 1, no lead, at every size |
| T-QUO-08 | Policy `off` | Required 0; marking done confirms |
| T-QUO-09 | Dependent's chore, guardian excluded | Eligible count drops by one, and the guardian is not a valid confirmer |
| T-QUO-10 | Lead requirement, three non-lead confirmations | Not confirmed |
| T-QUO-11 | Lead confirms last | Confirmed on the lead's row |
| T-QUO-12 | Lead confirms first | Confirmed on the second ordinary row |
| T-QUO-13 | A member joins between "done" and the last confirmation | The snapshotted requirement is unchanged |
| T-QUO-14 | A member leaves in the same window | Unchanged, and the chore is still completable |
| T-QUO-15 | Rejection after one confirmation | Quorum ends; chore returns for one retry |
| **T-QUO-P1** | **Property:** any Home size, any policy, any confirmation order | The assignee never appears among the confirmers |
| **T-QUO-P2** | **Property:** any Home size | The requirement never exceeds the eligible confirmer count |

### 2.9 Decision resolution (`T-DEC`) — **new in 2.0**

| ID | Case | Expected |
|----|------|----------|
| T-DEC-01 | Critical, all responses collected | `approved` |
| T-DEC-02 | Critical, one mandatory participant silent | `waiting`, whatever the counts say |
| T-DEC-03 | A required approver rejects | `rejected` immediately, other responses irrelevant |
| T-DEC-04 | Deadline passes with responses outstanding | `lapsed` |
| T-DEC-05 | The Co-Admin's acknowledgement counts for both its mandatory slot and the ack total | Approved without asking them twice |
| T-DEC-06 | Policy asks for 4 in a Home with 3 eligible | Requirement capped at 3, and the cap is reported |
| T-DEC-07 | Proposer is excluded from the counting pool | Their own approval never satisfies the member requirement |
| T-DEC-08 | Subject is excluded from participants | A member being removed is not asked |
| T-DEC-09 | One-person Home | Auto-approved, and the record says it was |
| T-DEC-10 | Two-person Home, no Co-Admin | The other person is required |
| T-DEC-11 | An acknowledger attempts to reject | Refused |
| T-DEC-12 | A rejection with a nine-character reason | Refused; ten characters accepted |
| T-DEC-13 | A participant removed from the Home mid-decision | Dropped from the participants; the requirement recomputes; the decision stays resolvable |
| **T-DEC-P1** | **Property:** any Home of 2–30, any role distribution, any policy | No single member's responses move a Critical decision to `approved` |
| **T-DEC-P2** | **Property:** any policy | The required count never exceeds the eligible count |
| **T-DEC-P3** | **Property:** any response sequence | The resolution is order-independent — the same set of responses always resolves the same way |

### 2.10 Food (`T-FOOD`) — **new in 2.0**

| ID | Case | Expected |
|----|------|----------|
| T-FOOD-01 | ₹180, three participants | ₹60 each, sum exact |
| T-FOOD-02 | ₹100, three participants | 3334, 3333, 3333 paise; sum exact |
| T-FOOD-03 | No participants | No per-person cost; nothing thrown |
| T-FOOD-04 | Guest as a participant | Counted as a head; no debt created |
| T-FOOD-05 | Library match: exact after normalisation | Offered |
| T-FOOD-06 | Library match: "parupu sadam" vs "Paruppu Sadham" | Offered as a candidate |
| T-FOOD-07 | Library match: genuinely new name | Treated as new, no false match |
| T-FOOD-08 | Person rating overrides Home rating | Suggested to the Home, not to that person |
| T-FOOD-09 | Item dislike suppresses a meal containing it | For that person only |
| T-FOOD-10 | Recency: eaten today vs 21 days ago | The older ranks higher, all else equal |
| T-FOOD-11 | Repetition: eaten four times this month | Heavily penalised |
| T-FOOD-12 | Budget tight, expensive vs cheap food | The cheaper ranks higher |
| T-FOOD-13 | Fewer than five recorded meals | Cold start; recent meals; no score |
| T-FOOD-14 | Every candidate scores negative | Empty library half with its message; nothing suggested |
| T-FOOD-15 | Two foods with identical scores | Ordered by name, identically on every run |
| **T-FOOD-P1** | **Property:** any total and 1–30 participants | `Σ shares == total`, exactly |
| **T-FOOD-P2** | **Property:** any library, ratings and history | Two runs produce the same two suggestions in the same order |

### 2.11 Shared chore shares (`T-SHR`) — **new in 2.0**

Carries CE-11, BR-078, BR-079.

| ID | Case | Expected |
|----|------|----------|
| T-SHR-01 | 25 points, 3 assignees | 8 / 8 / 9, sum exactly 25 |
| T-SHR-02 | 30 points, 2 assignees | 15 / 15 |
| T-SHR-03 | 1 point, 3 assignees | 0 / 0 / 1 — refused, because a share must be positive; the instance cannot be shared three ways |
| T-SHR-04 | Same instance, same assignee order, twice | Identical division |
| T-SHR-05 | A shared assignee attempts to confirm | Refused |
| T-SHR-06 | Any assignee of a shared instance attempts to confirm | Refused — not only the one who tapped Done |
| T-SHR-07 | Two-person Home, both are assignees | No eligible confirmer; auto-confirms at the window rather than blocking |
| T-SHR-08 | Shared instance missed | Each assignee misses their own share, not the whole weight |
| T-SHR-09 | One assignee swaps their share away | That share moves; the others are untouched; the total is unchanged |
| T-SHR-10 | Target calculator over a week containing shared instances | Sees shares, so no member's target is distorted |
| **T-SHR-P1** | **Property:** 1–100 points, 2–10 assignees | `Σ shares == points`, always |
| **T-SHR-P2** | **Property:** any shared instance | No assignee appears in the eligible-confirmer set |

### 2.12 Financial position and the reserve (`T-POS`) — **new in 2.0**

Carries EX-13, EX-14, IN-09 and 06-ALGORITHMS §6.5.

| ID | Case | Expected |
|----|------|----------|
| T-POS-01 | A member's `paid − fair_share` from the position view | Equals `expense_net` from the netting calculator, exactly |
| T-POS-02 | Member with no expected contribution set | `expected` and `against_expected` both null; no other figure changes |
| T-POS-03 | Member with an expected contribution who pays nothing | Full shortfall shown; nothing charged; settlement figures unchanged |
| T-POS-04 | Reserve contribution of ₹2,000 | Balance +2,000 and the contributor's `paid` +2,000, in one transaction |
| T-POS-05 | Draw of ₹4,000 against an approved expense | Expense's split attributed to the reserve; no member charged for it |
| T-POS-06 | Draw larger than the balance, at proposal time | Refused with the balance stated |
| T-POS-07 | Draw approved, a second draw empties the pot, then the first is applied | Refused at apply time; the decision records the failure |
| T-POS-08 | A funded reserve with a member in deficit at close | The deficit stands; the pot absorbs nothing |
| T-POS-09 | A member leaves with money in the pot | Their contribution stays; returning it requires a draw decision |
| T-POS-10 | Reserve created without a decision, via the service-role key | Refused by check constraint |
| **T-POS-P1** | **Property:** any sequence of expenses, contributions and draws | `Σ variance(m) + reserve_balance == 0` for the period |
| **T-POS-P2** | **Property:** any period | The position view and the settlement never disagree about a member's net |

### 2.13 Point explainability (`T-EXP`) — **new in 2.0**

Carries EF-12, BR-071, BR-072.

| ID | Case | Expected |
|----|------|----------|
| T-EXP-01 | `earned` for a member with confirmations, rejections and misses | Components sum exactly to the figure |
| T-EXP-02 | A member with zero earned | Components returned, explaining the zero — not an empty response |
| T-EXP-03 | `target` | Returns workload, member count, declared presence and applied carry, with their values |
| T-EXP-04 | `carry` where the cap applied | Shows the uncapped figure and the cap that was applied |
| T-EXP-05 | A shared instance in the history | Contributes its share, not the template's full weight |
| T-EXP-06 | Rejection component | Names the rejecting member and their reason |
| T-EXP-07 | `game_points`, `streak`, `badges` | Each opens to its own components and sums exactly |
| T-EXP-08 | Same data, two runs | Identical rows in identical order |
| **T-EXP-P1** | **Property:** any randomised sequence of assignments, confirmations, rejections, misses and absences | `Σ components == figure`, for every member and every figure |

---

## 3. Integration tests

### 3.1 Row Level Security (`T-RLS`)

The most important integration tests in the suite. Fixture: two houses, each with two members.

| ID | Assertion |
|----|-----------|
| T-RLS-01 | For **every** table in section 4 of the database document, a member of house A receives zero rows belonging to house B |
| T-RLS-02 | A `pending` member receives zero rows from their own house |
| T-RLS-03 | A non-admin cannot insert or update `chore_templates`, `rooms` or `house_settings` |
| T-RLS-04 | A member cannot mark someone else's chore done |
| T-RLS-05 | A member can confirm a chore that is not theirs |
| T-RLS-06 | A member cannot update another member's `member_availability` row |
| T-RLS-07 | An anonymous request receives zero rows from every table |
| T-RLS-08 | An inactive member receives zero rows |
| T-RLS-09 | **A `requested` member receives zero rows from every table in their own Home**, including `decisions`, `foods` and their own `join_requests` row |
| T-RLS-10 | A member cannot insert a `decision_responses` row for a decision they are not a participant in |
| T-RLS-11 | A member cannot insert a `decision_responses` row naming another member |
| T-RLS-12 | No role can update or delete a `decision_responses` row |
| T-RLS-13 | No role can update `decisions.status` |
| T-RLS-14 | A plain member cannot write `chore_templates`, `expense_categories`, `foods` or `invitations`; a Co-Admin can; `house_settings` and `governance_policy` remain admin-only |
| T-RLS-15 | A member of Home A, who is also a member of Home B, receives only Home A's rows when Home A is selected |
| T-RLS-16 | Every Active member reads `member_expected_contributions`, `reserves` and `reserve_movements` for their Home — there is no per-member privacy on the Home's financial position |
| T-RLS-17 | No `authenticated` role can insert, update or delete a row in `member_expected_contributions`, `reserves` or `reserve_movements`; those writes run only through `apply_decision` |
| T-RLS-18 | A member cannot insert, edit or delete a `chore_assignment_shares` row |
| T-RLS-19 | `meal_plans` is Home-scoped like every other table, and a `requested` member reads zero rows from it |

T-RLS-01 is written as a loop over the table list, so a newly added table without a policy fails the suite automatically. That is the mechanism that keeps SEC-01 true over time, and it is what carries the sixteen tables version 2.0 adds.

T-RLS-09 is its sibling for SEC-14, and matters just as much: the whole meaning
of "Requested" is that it grants nothing, and the only way that stays true as
tables accumulate is a loop that fails when one of them forgets.

### 3.2 Triggers and constraints (`T-TRG`)

| ID | Assertion |
|----|-----------|
| T-TRG-01 | Inserting splits that do not sum to the expense amount is rejected at commit |
| T-TRG-02 | Deleting one split row from a valid set is rejected |
| T-TRG-03 | Writing to an expense in a `closed` period is rejected |
| T-TRG-04 | `confirmed_by = assignee_member_id` is rejected by the check constraint |
| T-TRG-05 | `approved_by = paid_by_member_id` is rejected |
| T-TRG-06 | The transition to `confirmed` posts points exactly once, even under repeated identical updates |
| T-TRG-07 | A second update that leaves status at `confirmed` posts nothing further |
| T-TRG-08 | `updated_at` changes on every update |
| T-TRG-09 | Room occupancy above capacity is rejected |
| T-TRG-10 | `returns_at` before `leaves_at` is rejected |
| T-TRG-11 | `apply_decision` on a `waiting` decision is rejected, **called with the service-role key** |
| T-TRG-12 | `apply_decision` on an `approved` decision missing a mandatory response is rejected, with the service-role key |
| T-TRG-13 | `apply_decision` twice on the same decision applies the effect once |
| T-TRG-14 | `execute` on `apply_decision` and `resolve_decision` is revoked from `public`, `anon` and `authenticated` |
| T-TRG-15 | A `house_members` row with `status = 'requested'` and a non-null role is rejected, and the reverse |
| T-TRG-16 | A `decision_participants` row naming the decision's subject is rejected |
| T-TRG-17 | A `decision_responses` row with `capacity = 'acknowledger'` and `response = 'reject'` is rejected |
| T-TRG-18 | A rejection with a reason under ten characters is rejected |
| T-TRG-19 | A `chore_confirmations` row naming the assignee is rejected |
| T-TRG-20 | A `home_rule_versions` row with `activated_at` set and `decision_id` null is rejected |
| T-TRG-21 | A `balance_adjustments` row with a null `decision_id` is rejected |
| T-TRG-22 | `meal_participants` shares that do not sum to the meal total are rejected at commit; zero participants is accepted |

Four more carry the version-2 additions from the competitive analysis:

| ID | Case |
|----|------|
| T-TRG-23 | A `chore_assignment_shares` set that does not sum to the instance's points is rejected at commit by the deferred constraint trigger |
| T-TRG-24 | A `chore_confirmations` insert by any shared assignee is rejected by trigger, not only by the route |
| T-TRG-25 | A `reserve_movements` draw exceeding the balance is rejected at insert, under concurrency — two draws racing for the same balance leave it non-negative |
| T-TRG-26 | A `reserve_movements` row of kind `draw` with a null `decision_id` is rejected by check constraint, with the service-role key |

T-TRG-11, T-TRG-12 and T-TRG-14 are the three that carry SEC-12. They are run
**with the service-role key**, because the claim is not "the API refuses this" —
it is that nothing refuses to refuse it, including a maintenance script written
in a hurry. That is the lesson of D-20, applied to the surface most worth
attacking.

### 3.3 API routes (`T-API`)

Every endpoint gets, at minimum, a happy path and an authorisation failure. Cases beyond that:

| ID | Endpoint | Case |
|----|----------|------|
| T-API-01 | `POST /api/expenses` | Below threshold → `approved`; above → `pending_approval` |
| T-API-02 | `POST /api/expenses` | Date in a closed period → 409 with both options |
| T-API-03 | `POST /api/expenses/:id/approve` | By the payer → 403 |
| T-API-04 | `POST /api/chores/:id/done` | By a non-assignee → 403 |
| T-API-05 | `POST /api/chores/:id/confirm` | By the assignee → 403 |
| T-API-06 | `POST /api/chores/:id/confirm` | Twice concurrently → one succeeds, one 409, points posted once |
| T-API-07 | `POST /api/chores/:id/claim` | Two claimants → one succeeds, one 409 |
| T-API-08 | `POST /api/periods/:p/close` | With pending approvals → 409 listing them |
| T-API-09 | `POST /api/periods/:p/close` | Before the month has ended → 409 |
| T-API-10 | `POST /api/periods/:p/close` | Happy path → settlements net to zero, count ≤ n−1 |
| T-API-11 | `POST /api/settlements/:id/mark-paid` | By a non-payer → 403 |
| T-API-12 | `POST /api/settlements/:id/confirm` | By a non-receiver → 403 |
| T-API-13 | `POST /api/periods/:p/reopen` | Produces delta settlements, not a fresh full set |
| T-API-14 | `PUT /api/availability` | Returns derived windows matching the unit-test expectations |
| T-API-15 | `POST /api/availability/exceptions` | An away date on a published week returns the reassignments |
| T-API-16 | `POST /api/guests` | Mid-week registration regenerates only the remaining days |
| T-API-17 | `POST /api/ai/parse` | Without a key → 501 `AI_DISABLED` |
| T-API-18 | Rate limits | The 31st expense in an hour → 429 |
| T-API-19 | Idempotency | The same `Idempotency-Key` twice creates one record |
| T-API-20 | `PATCH /api/members/:id` | Demoting the last admin → 409 |
| T-API-21 | `PATCH /api/members/:id` | `{ status: "inactive" }` → 409 `DECISION_REQUIRED` |
| T-API-22 | Route tree | **No route creates a membership for another person.** Asserted by enumerating the route tree, not by trying one |
| T-API-23 | `POST /api/join/:token/request` | A revoked token → 404, with no indication whether the Home exists |
| T-API-24 | `POST /api/join/:token/request` | Twice → 409 `ALREADY_REQUESTED` |
| T-API-25 | `GET /api/join-requests` | As a plain member → 403; the count is still visible through `/api/houses/current` |
| T-API-26 | `POST /api/homes/select` | A Home the caller is only `requested` in → 403 |
| T-API-27 | `POST /api/decisions` | A subject who would be a participant → 422 |
| T-API-28 | `POST /api/decisions/:id/respond` | By a non-participant → 403 |
| T-API-29 | `POST /api/decisions/:id/respond` | Twice → 409 |
| T-API-30 | `POST /api/decisions/:id/respond` | Two participants concurrently, both completing → one applies, one 409, the effect happens once |
| T-API-31 | `POST /api/approvals/approve-all` | Skips a Critical decision that would complete, naming why, and approves the rest |
| T-API-32 | `PUT /api/governance/policy` | → 409 `DECISION_REQUIRED` |
| T-API-33 | `POST /api/periods/:p/close` | Returns a decision, not a closed period; the settlement rows appear only at apply |
| T-API-34 | `POST /api/periods/:p/reopen` | Without a reason → 422 |
| T-API-35 | `POST /api/absences` | With `excuse_chores: false` → resolves immediately, no decision |
| T-API-36 | `POST /api/absences` | Approved → chores redistributed and target reduced; rejected → neither |
| T-API-37 | `POST /api/chores/:id/confirm` | In a four-person Home, two ordinary members → still `done_pending` |
| T-API-38 | `POST /api/rules` | Creates a decision; the rule stays `draft` |
| T-API-39 | `POST /api/rules/parse` | With no key → 200 `parsed_by: manual`, not an error |
| T-API-40 | `POST /api/food/meals` | Name and date only → 201 |
| T-API-41 | `DELETE /api/food/meals/:id` | A linked expense survives, and the reverse |
| T-API-42 | `GET /api/food/suggestions` | With AI off → the library half alone, `ai_available: false`, 200 |
| T-API-43 | `POST /api/adjustments` | Applied → both members' nets move by the same amount and `Σ final_net` stays zero |
| T-API-44 | `POST /api/chores/:id/done` | With **no body at all** → 201 and `done_pending`. Nothing is required before the transition (CE-12) |
| T-API-45 | `GET /api/chores/templates` | Every row carries `last_done_at`; a never-confirmed template returns `null`, not its creation date |
| T-API-46 | `POST /api/chores/:id/share` | Divides exactly and returns the shares; the quorum then excludes every assignee |
| T-API-47 | `GET /api/position` | Its `variance` per member equals `GET /api/balances`' `net`, from the same calculator |
| T-API-48 | `POST /api/expected-contributions` | Returns a decision, never a written value |
| T-API-49 | `POST /api/reserves/:id/draw` | Returns a decision; a draw over the balance → 409 `RESERVE_INSUFFICIENT` |
| T-API-50 | `GET /api/effort/explain` | Components sum exactly to the figure, for every `figure` value |
| T-API-51 | `POST /api/food/plans` | Creates no meal, no expense, no participants; the plan appears in no Insights or recommender input |
| T-API-52 | `POST /api/food/meals/:id/to-expense` against an unconfirmed plan | 409 `PLANNED_MEAL_NOT_EATEN` |
| T-API-53 | `GET /api/insights/export`, `/export/full`, `/statement.pdf` | Available to a plain member with no gate, no quota and no waiting period |

### 3.5 Governance end to end (`T-GOV`) — **new in 2.0**

The negative-space tests. Each runs against a real database.

| ID | Assertion |
|----|-----------|
| T-GOV-01 | In an eight-person Home, the Admin alone cannot close a month, through any sequence of API calls |
| T-GOV-02 | The same, attempted directly against the database with the service-role key |
| T-GOV-03 | In a two-person Home with no Co-Admin, one person cannot complete a Critical decision |
| T-GOV-04 | A one-person Home auto-approves, and the decision record says so |
| T-GOV-05 | A decision past its deadline is lapsed by the hourly job with nobody signed in |
| T-GOV-06 | An approved decision whose effect fails records `apply_error` and changes nothing |
| T-GOV-07 | A removal with money outstanding leaves the member `inactive` and flagged, and completes on the last settlement confirmation |
| T-GOV-08 | The same removal completes through the daily job when the trigger path is not exercised |
| T-GOV-09 | A rule activates only through a decision, and its previous version stays readable with its own dates |
| T-GOV-10 | The last Admin's approved removal cannot apply, and says why |

### 3.4 Scheduled jobs (`T-JOB`)

| ID | Job | Assertion |
|----|-----|-----------|
| T-JOB-01 | `generate-weekly-schedule` | Creates one `schedule_run` and the full assignment set |
| T-JOB-02 | `generate-weekly-schedule` | Running twice for the same week is a no-op |
| T-JOB-03 | `generate-weekly-schedule` | Closes the previous week's ledger in the same transaction |
| T-JOB-04 | `generate-weekly-schedule` | A mid-run failure rolls back completely |
| T-JOB-05 | `auto-confirm-chores` | Confirms only what is past the window; posts points once |
| T-JOB-06 | `auto-confirm-chores` | Skips anything already rejected |
| T-JOB-07 | `mark-missed-chores` | Marks only past-deadline `assigned` items |
| T-JOB-08 | `post-recurring-expenses` | Posts on the due day; never twice in one period |
| T-JOB-09 | `post-recurring-expenses` | A `closing` period pushes the posting to the next open one |
| T-JOB-10 | `dispatch-reminders` | Respects quiet hours, the daily cap and availability timing |
| T-JOB-11 | `budget-alerts` | Fires once on the day a threshold is crossed, not daily thereafter |
| T-JOB-12 | `expire-decisions` | Lapses only decisions past their deadline; leaves resolved ones alone; is idempotent |
| T-JOB-13 | `remind-decisions` | One reminder per person per decision, 24 hours out, and never a second |
| T-JOB-14 | `complete-pending-removals` | Completes a removal for a member who became clear; skips one who did not |
| T-JOB-15 | `refresh-food-suggestions` | Writes a cached result per Home; a screen view makes no LLM call |

---

## 4. End-to-end tests

Twenty-two tests on a Pixel 5 viewport, against a seeded Home. One exists;
the rest arrive with the phases that make them possible, one per phase.

| ID | Journey | Steps |
|----|---------|-------|
| E2E-01 | Home setup | Create Home → choose type and location → add 3 rooms → share the link → accept 7 requests → promote a Co-Admin → assign rooms → review templates → generate week |
| E2E-02 | Member onboarding | Open the invite link → sign up → request → see the waiting screen with nothing else on it → be accepted → set presence → enable notifications |
| E2E-03 | **Chore lifecycle** | Ravi marks done with a photo → Kumar receives the request → Kumar confirms → points appear on the leaderboard |
| E2E-04 | Auto-confirm | Mark done → advance the clock 48 hours → verify the points posted with `auto_confirmed = true` |
| E2E-05 | Rejection and retry | Mark done → reject with reason → verify the deadline extended → redo → confirm |
| E2E-06 | **Expense entry** | Add ₹1,240 groceries in three taps → verify the split preview → save → verify visibility to another member |
| E2E-07 | Approval flow | Add ₹5,000 → verify `pending_approval` → another member approves → verify it enters balances |
| E2E-08 | **Month close** | Close August → verify the four wizard steps → verify nets to zero → verify payments created and notified |
| E2E-09 | Settlement | Payer opens the UPI link → marks paid → receiver confirms → period locks |
| E2E-10 | Late expense | Log a July expense in August → choose carry-forward → verify the tag and the July-membership split |
| E2E-11 | Guest weekend | Register a guest → verify Saturday's schedule includes them → verify the expense head count → verify the host's share |
| E2E-12 | Offline | Go offline → attempt a mutation → verify the honest failure and the retryable state → go online → retry |
| E2E-13 | **Shared close** | Admin proposes closing August → Co-Admin acknowledges → three members acknowledge → the month closes → verify that at no point before the last acknowledgement did any settlement row exist |
| E2E-14 | **Approvals queue** | Six items pending → Approve All → verify five approved and the settlement decision skipped with its reason → open it → review the effect → acknowledge |
| E2E-15 | **Removal with money outstanding** | Propose → acknowledge → approve → verify Inactive and flagged → settle the last payment → verify the removal completed by itself |
| E2E-16 | **A rule, end to end** | Type it in plain English → parse → edit → submit → acknowledge → verify version 1 live → edit → verify version 2 live and version 1 still readable with its own dates |
| E2E-17 | **A meal and a suggestion** | Add a meal by name with a library match → rate it → verify it appears in the two library suggestions the next day → verify a member who dislikes one of its items is not shown it |
| E2E-18 | **Multi-Home** | Belong to two Homes with different roles → switch → verify the second Home's data, role and permissions, and that nothing from the first is visible |
| E2E-19 | **One-tap Done** | From Today, mark a chore done in a single tap with nothing filled in first → verify `done_pending` → attach a photo afterwards → verify the photo did not gate the transition (CE-12) |
| E2E-20 | **The reserve, end to end** | Propose a reserve → acknowledge → approve → contribute → verify no member's owed figure moved → propose a draw → approve → verify the paid expense charges nobody → verify `Σ variance + reserve_balance = 0` (EX-14) |
| E2E-21 | **Explaining a disputed figure** | A member with a rejected chore and a miss opens their earned points → verify the components sum to the figure and name the rejecting member and their reason (EF-12) |
| E2E-22 | **A planned meal becomes a record** | Place a library meal on a future date → verify it appears on the Calendar and in no history or Insights → confirm it as eaten → verify it now behaves as an ordinary meal (FD-20) |

Accessibility is asserted inside E2E-03, E2E-06, E2E-08, E2E-13 and E2E-17 via
axe-core: zero critical violations.

E2E-13 carries the sentence this version of the product exists for, and it is
written as a **negative assertion inside a journey**: not only that the close
worked, but that it could not have worked earlier.

---

## 5. Non-functional tests

| ID | Requirement | Method | Threshold |
|----|-------------|--------|-----------|
| NF-01 | NFR-01 first paint | Lighthouse CI, 4G throttle | < 1.8 s |
| NF-02 | NFR-03 generation speed | Benchmark, 30 members × 200 instances | < 5 s |
| NF-03 | Bundle size | `next build` analysis | Initial JS < 180 KB gzipped |
| NF-04 | NFR-04 responsive | Playwright at 360, 640, 1024, 1440 px | No horizontal scroll anywhere |
| NF-05 | NFR-06 contrast | axe-core, both themes | Zero contrast violations |
| NF-06 | Dark mode | Visual snapshot of all 57 screens | No unreadable element |
| NF-07 | SEC-06 redaction | Scan every `llm_runs.input_payload` produced by the suite | No `@`, no 10-digit number, no UUID, no member name, no Home name, no street address |
| NF-08 | No-key operation | Full suite with no environment key and no `house_llm_credentials` row | All green |
| NF-09 | Stored key secrecy | Grep every route response, log line and `llm_runs` row produced by the suite for the fixture key | Never present; only `key_last4` appears |
| NF-10 | SEC-12 | Every state-changing decision effect attempted directly with the service-role key | Refused unless `approved` with every mandatory response |
| NF-11 | SEC-14 | A `requested` member queries every table in their own Home | Zero rows, everywhere |
| NF-12 | SEC-17 | Scan every row in `expenses`, `settlements`, `home_rules`, `decisions`, `chore_assignments` and `foods` produced by the suite | None has an AI-authored origin |
| NF-13 | AI-02 | Source scan for imports of `resolveLlm` outside `lib/infra/llm/` | Only `route()` is used at call sites |
| NF-14 | NFR-15 determinism | Run the food recommender and the settlement netting twice over identical fixtures | Byte-identical output |
| NF-15 | NFR-17 | Decision response and resolution, p95 over 200 runs | Under 500 ms |
| NF-16 | Expense entry speed | Scripted three-tap expense entry, measured end to end | Under 10 seconds, re-measured after the Food phase |
| NF-17 | NFR-18 unmetered recording | Record 40 expenses, 40 chore completions and 40 meals as one member in one session | No cap, no waiting period and no tier is encountered; if a rate limit fires, the limit is mis-sized and the test fails |
| NF-18 | NFR-19 permanent portability | Source scan of every export route for a feature gate, quota check or payment check | None present; every export route reachable by a plain Active member |
| NF-19 | NFR-20 durable writes | Every mutation in the app driven with the network failed mid-flight | No screen reports success; the entered values survive; the action stays retryable; nothing is silently queued |
| NF-20 | CM-2 no premium surface | Source scan for a billing path, a paywall component or an advertising slot | None present |

---

## 6. Test data

`supabase/seed.sql` builds the house described in section 9 of the database document. Three named fixtures drive most tests:

| Fixture | Contents |
|---------|----------|
| `home.minimal` | 1 Admin, 1 room, 2 chore templates. Edge cases E-01, E-02, E-53. |
| `home.pair` | 2 people, no Co-Admin. The governance edge that is easiest to get wrong (E-54, T-DEC-10). |
| `home.standard` | 8 members — 1 Admin, 1 Co-Admin, 6 Members — 1 Requested, 1 Inactive with money outstanding, 3 rooms, 9 templates, varied presence, 2 months of history, decisions in all six states, 4 rules across 2 versions, a 12-food library with 40 meals and item-level preferences. The default. |
| `home.family` | Pot mode, penalties off, `confirmation_policy = 'single'`, two dependents, no leaderboard. |
| `home.stress` | 30 members, 10 rooms, 25 templates, 500 meals, 200 decisions. Performance tests only. |
| `home.duplicates` | The four spellings of Paruppu Sadham, for the deduplication tests. |

A person who belongs to both `home.standard` and `home.family`, with a different
role in each, exists deliberately: it is the fixture behind T-RLS-15 and E2E-18,
and multi-Home leakage is the kind of defect that only shows up when somebody
actually has two.

Clock control: every test that depends on time uses an injectable clock. No test calls `sleep`. Advancing 48 hours to verify auto-confirmation takes microseconds.

---

## 7. Gates

**Per commit:** unit, property, integration, RLS, triggers. Under 60 seconds total.

**Per pull request:** the above, plus E2E, accessibility, and the no-key suite.

**Per deploy:** the above, plus Lighthouse and the migration check against a fresh database.

**Per phase, before it is called done:** every acceptance criterion in [07-ROADMAP.md](07-ROADMAP.md) for that phase, demonstrated by running it. Reading the code is not demonstration.

---

## 8. Coverage expectations

| Area | Target | Rationale |
|------|--------|-----------|
| `lib/domain/` | 100% branch | This is where wrong answers become invisible. Nothing less is acceptable. |
| `lib/data/` | 80% | Repository code is thin; its errors are loud. |
| `app/api/` | 90% | Every route has both a happy path and an authorisation failure. |
| Components | 40% | Covered chiefly through E2E. Unit-testing presentation has poor returns. |
| Overall | 80% | |

Coverage is a floor, not a goal. The nineteen property tests marked `-P` in this
document catch more real defects than any percentage, because they test the
invariants the product's credibility rests on:

1. Splits sum exactly.
2. Settlements net to zero.
3. A generated schedule never violates a hard constraint.
4. **No one person can complete a Critical decision in a Home of two or more.**
5. **A person never confirms their own chore, at any Home size or policy.**
6. **The same food data always produces the same two suggestions.**
7. **A shared chore's shares sum to the instance's points**, and no assignee of it can confirm it.
8. **`Σ variance(m) + reserve_balance = 0`** for every period — money is conserved across the members and the pot together.
9. **Every points figure's components sum exactly to the figure**, including a figure of zero.

The fourth is the one to protect hardest, because it is the only invariant on
that list whose violation looks like a working feature. A settlement that does
not net to zero blocks a close and announces itself. A Critical decision that one
person completed alone produces a correctly closed month, a correct settlement,
and a Home that no longer has the property it was promised — silently, and
usually noticed months later during an argument.
