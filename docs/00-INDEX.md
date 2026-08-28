# HouseOS — Documentation Index

**Working title:** HouseOS. The interface says **Home**; the schema says
`house`. The mapping is fixed and documented in
[01-BRD.md](01-BRD.md) section 0.1.

**One-line description:** A Home Operating System — the shared management of
people, work, money, food, calendar and decisions in one household, where
everything is visible, everyone contributes, and important decisions are shared.

**Status:** Specification version 2.0 adopted on 2026-08-26. Product phase 1
(web/PWA) is in progress. Engineering phases 1–8 are built against
specification 1.0 and phase 9 is built but not yet applied to an environment;
phases 10–15 implement the version-2.0 additions — governance, rules, food,
calendar, navigation and insights. Product phase 2 (native Android/iOS,
engineering phase 17) follows the web launch. See
[`../PROGRESS.md`](../PROGRESS.md) for the current state and
[`../DECISIONS.md`](../DECISIONS.md) for the choices made while building.

**Last updated:** 2026-08-27

---

## The problem this exists to solve

A shared home has three silent failures and one that appears the moment the
first three are fixed.

1. **Work concentration.** A minority do all the cooking, cleaning, mopping and
   bathroom duty. There is no record, so there is no argument to make.
2. **Expense concentration.** A minority pay for everything, and the month is
   closed by hand with nothing retained. No audit trail, no analytics,
   late-discovered expenses simply lost.
3. **Food amnesia.** The home's largest recurring cost and most frequent daily
   decision leaves no record at all — what was eaten, what it cost, who ate it,
   whether anyone liked it.
4. **Who decides.** Once an app holds the record, whoever controls the app
   controls the argument. Shared governance exists so that the mechanism belongs
   to the home rather than to its Admin.

The product converts all four into visible, dated, undeniable records — and then
distributes the load automatically according to who is actually home and when.

---

## Document map

| # | Document | What it answers | Primary reader |
|---|----------|-----------------|----------------|
| 01 | [BRD.md](01-BRD.md) | Why we are building this, for whom, what success means, and every functional requirement in business language | Product owner, home members |
| 02 | [TRD.md](02-TRD.md) | What the system must do technically: stack, non-functional requirements, integrations, security, constraints | Developer |
| 03 | [ARCHITECTURE.md](03-ARCHITECTURE.md) | How the pieces fit together, what runs where, how data flows | Developer |
| 04 | [DATABASE.md](04-DATABASE.md) | Entity model, full DDL, indexes, triggers, row-level-security policies | Developer |
| 05 | [API-SPEC.md](05-API-SPEC.md) | Every endpoint, its contract, and its authorisation rule | Developer |
| 06 | [ALGORITHMS.md](06-ALGORITHMS.md) | Availability, scheduling, splitting, netting, confirmation quorum, decision resolution, food recommendation — with worked numeric examples | Developer |
| 07 | [ROADMAP.md](07-ROADMAP.md) | Build order, phase scope, acceptance criteria per phase | Everyone |
| 08 | [UI-UX-SPEC.md](08-UI-UX-SPEC.md) | Design tokens, navigation, every screen with its states, components, accessibility, performance budget | Developer |
| 09 | [BUSINESS-RULES.md](09-BUSINESS-RULES.md) | Every enforced rule, every field validation, the edge cases, the error catalogue, default seed data | Developer |
| 10 | [LLM-SPEC.md](10-LLM-SPEC.md) | The AI router, the provider registry, the per-home key, capabilities, and the exact prompts, schemas, validation and fallbacks for all six call sites | Developer |
| 11 | [NOTIFICATIONS-SPEC.md](11-NOTIFICATIONS-SPEC.md) | Every notification type with exact copy, timing rules, volume caps, push payloads | Developer |
| 12 | [TEST-PLAN.md](12-TEST-PLAN.md) | Every test case by level, the property tests, coverage floors, CI gates | Developer |
| 13 | [SETUP-RUNBOOK.md](13-SETUP-RUNBOOK.md) | Zero to deployed: every command, every key, post-deploy verification, troubleshooting | Developer |
| 14 | [GOVERNANCE-SPEC.md](14-GOVERNANCE-SPEC.md) | The Decision engine, the Approval engine, the three levels, the matrix, quorum resolution, and Rules with their versioning | Developer |
| 15 | [FOOD-SPEC.md](15-FOOD-SPEC.md) | Meals, items, sources, costs, participants, the library, preferences, both recommendation paths, and planned meals | Developer |
| 15 | [FOOD-SPEC.md](15-FOOD-SPEC.md) — §5.2a | Restrictions: the hard exclusions no recommendation score may outrank, and what each severity does when a meal is recorded anyway | Developer |
| 16 | [COMPETITIVE-POSITIONING.md](16-COMPETITIVE-POSITIONING.md) | Every competitor capability and complaint in [`Competitor_Analysis.txt`](Competitor_Analysis.txt), mapped to the requirement that carries it, the commitment that answers it, or the reason we do not build it | Product owner, developer |

### Source documents

Two files in this directory are inputs, not specifications. They are kept
because the documents above are derived from them and the derivation should stay
auditable.

| File | What it is |
|------|-----------|
| [`new_BRD.txt`](new_BRD.txt) | The version-2.0 requirements as originally written, before they were split across 01 to 15. Where it and a numbered document disagree, **the numbered document wins.** |
| [`Competitor_Analysis.txt`](Competitor_Analysis.txt) | Raw competitor capabilities and user complaints. Mapped to requirements in [16-COMPETITIVE-POSITIONING.md](16-COMPETITIVE-POSITIONING.md). |

### Documents outside this directory

Four live at the repository root because they describe the repository rather
than the product.

| File | What it answers |
|------|-----------------|
| [`../README.md`](../README.md) | Setup, architecture and domain rules, in one page |
| [`../DECISIONS.md`](../DECISIONS.md) | Every non-obvious decision, D-01 onward, with the reasoning. Preserve a decision unless the task explicitly changes it |
| [`../PROGRESS.md`](../PROGRESS.md) | What is built, what has actually been applied to a database, and what has actually been observed to run. **The authority on state**, where the documents here are the authority on intent |
| [`../SECURITY.md`](../SECURITY.md) | The threat model — assets, adversaries, and what is explicitly out of scope — plus the security architecture, the secret inventory, and disclosure |

Read 00 to 07 in order the first time, then 14 and 15 before touching
governance or food. 08 to 13 are working references you open while building the
thing they describe. 13 is followed once, start to finish, on day one. 16 is read
before arguing that a competitor has something we lack — it either names the
requirement that already covers it, or states why we chose not to build it.

## Product delivery phases

| Product phase | Scope | Exit gate |
|---|---|---|
| 1 — Web/PWA | The complete Home OS on the web, production-hardened and launched | Usable by a real home, with verified security, backups, monitoring, privacy/support pages, and real-device web smoke tests |
| 2 — Native mobile (engineering phase 17) | Android and iOS clients over the stable backend, native push, device capabilities, store distribution | Play internal testing and production release verified; TestFlight/App Store release verified; native push and deep links work on real devices |

Native clients are not a zero-code wrapper. The API, database and domain rules
are shared; client navigation, secure token storage, uploads, deep-link handling
and push transport are platform work in product phase 2.

### Which document answers which question

| Question | Document |
|----------|----------|
| What should this button do? | 08, then 09 |
| Who has to say yes before this happens? | 14, then 01 section 7 |
| What happens if two people confirm at once? | 09, section 3 |
| How many people must confirm a chore here? | 06, section 3 |
| What exactly does the solver optimise? | 06, section 2 |
| Why is this meal being suggested? | 15, section 5 |
| What column stores this? | 04 |
| What does this endpoint return on failure? | 05, then 09 section 4 |
| What text does this notification use? | 11 |
| What do I send the model, and what do I do if it lies? | 10 |
| How do I know this phase is finished? | 07, then 12 |
| How do I get this running? | 13 |

---

## The ten design decisions everything else follows from

Settled during design. Changing any one invalidates parts of several documents.

1. **Effort is measured in points, not chore count.** Cooking dinner and wiping
   a table are not the same job, and counting them equally is what lets
   freeloading hide.

2. **Low availability changes which chores you get, never how many points you
   owe.** A member who leaves at 08:00 and returns at 22:00 gets weekend-heavy
   work, not less work. Without this rule, "my job is demanding" becomes the new
   way to opt out. Declared *absence* is different and does reduce a target.

3. **A chore earns points only when confirmed by other people — a quorum sized
   to the home — and never by the person who did it. Silence auto-confirms.**
   Mandatory peer confirmation with no timeout hands non-participants a veto:
   they never tap approve, and the people doing the work never get credit. The
   window preserves the ability to reject while removing the ability to stall.

4. **Unpaid effort becomes money at month end, where the home has agreed to
   it.** A member who ends the month in deficit pays a per-point rate into the
   settlement, credited to the members who carried the surplus. The rate, and
   whether it exists at all, is a governed decision rather than an admin setting.

5. **Everyone sees everything.** Every expense, every assignment, every balance,
   every meal, every decision and every rule — including who owes whom, for
   everyone, not only for the person looking. Transparency is the product, not a
   feature of it.

6. **Closed months stay closed, and both closing and reopening are shared
   decisions.** A late expense is by default posted forward as a tagged
   adjustment computed against the membership as it stood. Reopening requires the
   home, not the Admin.

7. **Important decisions cannot be completed by one person.** Admin initiates,
   Co-Admin acknowledges, and the required members respond. Nothing changes while
   a decision is `Waiting`. Approval gates and can reject; acknowledgement gates
   and cannot. Both are recorded forever.

8. **The home writes its own rules in its own words.** AI parses the text into a
   structured proposal; a person reviews and edits it; governance activates it;
   every version is kept. AI is a parser, never the authority.

9. **Food is a module, not a category.** A meal is a named thing with items, a
   source, costs and participants. Suggestions come in two separated groups: two
   from the home's own library, computed deterministically, and two AI ideas
   clearly marked as new. Recording food is never mandatory and never a
   precondition for money.

10. **The LLM proposes; the rule engine disposes.** Every LLM output is validated
    before use. The deterministic core — login, homes, members, roles,
    permissions, availability, assignment, points, absence, expenses, splits,
    balances, settlement, approvals, voting, rules storage, notifications,
    calendar, food library, food voting, analytics — works with no key
    configured anywhere.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Home** | The root tenant entity. All data belongs to exactly one Home. Stored as `houses`. |
| **Person** | A user account. May belong to many Homes. |
| **Member** | A person's membership in one Home, carrying their role and state. |
| **Requested** | A person who has asked to join. Not a role. No permissions. |
| **Active / Inactive** | The two membership states after acceptance. Inactive keeps history and outstanding money. |
| **Admin / Co-Admin / Member** | The three roles. Admin is a custodian, not an owner. |
| **Decision** | The generic record behind every shared decision: type, requester, required participants, approvals, acknowledgements, deadline, status, result. |
| **Approval** | A required response that gates an action and may reject it. |
| **Acknowledgement** | A required confirmation of having seen a decision. Gates the action; cannot reject it. |
| **Quorum** | The set of confirmations a chore needs, sized to the Home's Active member count. |
| **Rule** | A Home rule: original text, parsed structure, version history, and an activation that went through governance. |
| **Guest** | A non-member person staying temporarily, registered by a host. A head for cost, and optionally assignable work. |
| **Dependent** | A resident with no account. A head for cost, may hold chores a guardian marks done, never billed or fined directly. |
| **Chore template** | The recurring definition of a job — name, points, duration, slot, frequency, scope. |
| **Chore assignment** | One concrete instance of a template, on a date, assigned to a person. |
| **Slot** | MORNING, EVENING or ANY — the part of day a chore must be done in. |
| **Free window** | The minutes a member is home and available on a given day. |
| **Effort points** | The difficulty weight of a chore. The unit of fairness. |
| **Target** | The points a member is expected to earn in a week. |
| **Carry** | The running surplus (positive) or deficit (negative) against target. |
| **Absence** | A declared, dated non-presence, optionally requesting that the affected chores be excused. |
| **Period** | A calendar month of expenses, moving OPEN → CLOSING → CLOSED. |
| **Fair share** | The total of all expense splits allocated to a member in a period. |
| **Net** | Total paid minus fair share. Positive means the Home owes the member. |
| **Balance Adjustment** | A governed correction to a balance. Historical expenses are never edited. |
| **Settlement** | One directed payment from one member to another that clears a period. |
| **Meal** | A named thing that was eaten, with items, a source, costs and participants. |
| **Food Library** | The Home's own catalogue of meals it has eaten, deduplicated and reusable. |
| **Preference** | A standing opinion about a food or an item — like, okay, dislike. A weight in the recommendation score. |
| **Restriction** | What a person *cannot* eat, at one of three severities. Not a preference: it removes candidates before scoring, and no score outranks it. |
| **Erasure** | Removal of a person's account and everything personal to it, retaining their Home's arithmetic under a pseudonym. Distinct from removal, which is a decision the Home takes. |
| **History** | The permanent activity log of everything that happened and who did it. |
