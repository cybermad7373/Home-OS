# 09 — Business Rules, Validation and Edge Cases

**Product:** HouseOS
**Version:** 2.0
**Date:** 2026-08-28

Every rule the system enforces, every field it validates, every edge case it must survive, and every error it can return. Where a rule is enforced in more than one place, the enforcement points are listed. This document is the answer to "what should happen when…".

---

## 1. Business rules catalogue

Rules are numbered `BR-nnn` and referenced from tests.

### 1.1 Membership

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-001 | A Home always has at least one active Admin. Removing or demoting the last Admin is refused. | API + trigger |
| BR-002 | A person has at most one membership per Home. | Unique constraint |
| BR-003 | A `requested` person sees nothing except the waiting screen. RLS treats them as a non-member of every table in that Home. | RLS (`status = 'active'`) |
| BR-004 | Making a member inactive sets `left_date` and never deletes history. Their past assignments, expenses, splits, meals and decision responses remain. | API |
| BR-005 | An inactive member is excluded from new schedules and new expense splits from `left_date` onward, but remains in splits for expenses dated before it. | Split calculator, demand builder |
| BR-006 | An inactive member with a non-zero balance is included in the settlement of the period in which they left. | Settlement |
| BR-007 | Re-accepting someone creates a new active window; it does not merge with the old one. | API |
| BR-008 | An invite link carries an opaque token of at least 128 bits of entropy. It is not a human-typed code. | Generator |
| BR-009 | Rotating the invite link revokes the previous one immediately. Requests already raised and memberships already accepted are unaffected. | API |
| BR-160 | **A `requested` membership has no role.** `status = 'requested'` and `role is null` imply each other, in both directions. | Check constraint |
| BR-161 | **There is no path that creates a membership for another person.** Membership begins with a request raised by the person themselves. The single exception is a dependent, who has no account and no permissions. | API — absence of a route, and a test asserting that absence |
| BR-162 | Accepting a join request creates an `active` membership with `role = 'member'`. Roles above member are granted afterwards, deliberately. | API |
| BR-163 | Declining a join request requires a reason. The person may request again. | API |
| BR-164 | At most one live join request exists per person per Home. Declined and withdrawn ones accumulate and are kept. | Partial unique index |
| BR-165 | **Removing a member is a Critical decision.** No route deactivates or removes anybody directly. | API returns `DECISION_REQUIRED` |
| BR-166 | On an approved removal, a financially clear member is removed and a member with outstanding money becomes `inactive` with `pending_settlement = true`. | Decision effect |
| BR-167 | "Financially clear" means: no unsettled settlement in either direction, no approved split in an open period, and no pending balance adjustment. | Removal check |
| BR-168 | A pending removal completes automatically when the member becomes clear — on settlement confirmation, and again by a daily job. Nobody has to remember to come back to it. | Trigger + cron |
| BR-169 | A person may belong to any number of Homes. Their role in one has no effect in another. | Schema — role is on the membership |
| BR-170 | The selected Home is held server-side. A request never names a Home in its body. | API |
| BR-171 | An invite link carries an expiry. The default is **14 days** from issue, and a Home may shorten it. An expired link behaves exactly as a revoked one — the same message, revealing nothing about whether the Home exists (E-66). | Schema + API |
| BR-172 | The token is stored as a **hash**, never in plaintext. A database read does not yield a working invite link. The plaintext is shown once, at the moment it is generated, and is not recoverable afterwards. | Schema + API |
| BR-173 | Token comparison is constant-time against the hash, and a failed lookup costs the same as a successful one. Timing must not distinguish "no such link" from "wrong link". | API |
| BR-174 | Two people opening the same live link concurrently both succeed. A link is an address, not a seat: it authorises **raising a request**, and every request is accepted individually by the Home. There is nothing for them to race for. | API |
| BR-175 | The same person submitting a request twice concurrently produces one request, not two. The partial unique index of BR-164 is the arbiter, and the second submission is answered with the first request's state rather than an error. | Partial unique index + API |
| BR-176 | Rotation is not revocation-by-overwrite: the previous token row is retained, marked revoked with a timestamp, and continues to answer as expired. Replay of an old token is therefore refused by a positive record rather than by absence, and the refusal is auditable. | Schema + API |
| BR-016 | **A new Home is usable before it is fully configured.** Home creation seeds a workload a real Home can meet in its first week (section 5), and no screen requires a complete chore catalogue, a full member list or a rule set before the Home can record anything. The Admin is shown the seeded weekly total and the per-member target it implies, and told to reduce it if it looks wrong. Carries HM-20. | Seeder + setup flow |

### 1.2 Rooms

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-010 | A room's occupant count may not exceed its capacity. Exceeding it is refused with the current occupants listed. | API |
| BR-011 | A member occupies at most one room at a time. Assigning to a new room closes the previous `room_assignment` with `to_date = today`. | API |
| BR-012 | A room may not be deleted while it has current occupants. | API |
| BR-013 | A vacant room's rent is split equally across all active members, not absorbed by any one room. | Split calculator |
| BR-014 | A room change mid-month splits that month's rent proportionally by days occupied in each room. | Split calculator |
| BR-015 | A member with no room assignment is excluded from room-rent splits but included in every equal split. | Split calculator |

### 1.3 Availability

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-020 | Every active member must have all seven availability rows. Missing rows default to home all day, and the member is prompted to correct them. | Onboarding + generator default |
| BR-021 | `returns_at` must be later than `leaves_at` on the same day. Overnight shifts are expressed as `is_home = false` for that day. | Check constraint + API |
| BR-022 | A derived window shorter than 15 minutes is discarded. | Window derivation |
| BR-023 | A member with `is_home = false` for a weekday has zero capacity that day and receives no assignments. | HC-1 |
| BR-024 | An availability change never alters an already-published week. It applies from the next generation. | Generator |
| BR-025 | An approved absence on a published week triggers immediate redistribution of that member's assignments on those dates. **Changed in 2.0:** the redistribution follows the approval, not the declaration. | Decision effect |
| BR-026 | Two exceptions may not exist for the same member on the same date. The later replaces the earlier. | Unique constraint + upsert |
| BR-027 | An exception may be created at most 90 days in advance and never for a past date. | API |
| BR-028 | A `weekday_only` member has zero capacity on Saturday and Sunday; a `weekend_only` member has zero capacity Monday to Friday, regardless of what their availability rows say. | Window derivation |
| BR-029 | An absence that does not ask for its chores to be excused (`excuse_chores = false`) needs no decision. It records the absence, writes the exception, and leaves the work where it is. | API |

### 1.4 Chores and scheduling

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-030 | Effort points are an integer between 1 and 100. | Check constraint |
| BR-031 | Duration is an integer between 5 and 240 minutes. | Check constraint |
| BR-032 | A `scope = 'room'` template must name a room; a `scope = 'house'` template must not. | Check constraint |
| BR-033 | Deactivating a template stops future expansion but leaves existing assignments intact. | API |
| BR-034 | Changing a template's points does not alter assignments already created. Points are snapshotted on the assignment. | Schema (`chore_assignments.effort_points`) |
| BR-035 | A week may be generated only once automatically. Manual regeneration preserves every `confirmed` and `done_pending` assignment and redistributes only `assigned`, `open` and `missed` ones. | Generator |
| BR-036 | A generated week is published immediately. There is no draft state in version 1. | Generator |
| BR-037 | An instance with no eligible member is created with `status = 'open'` and `assignee_member_id = null`, and the admin is notified. Generation never aborts. | Generator |
| BR-038 | A member receives at most 3 instances or 150 minutes on any single day. | HC-6 |
| BR-039 | A chore's deadline is the end of its window, except for an `any`-slot chore, whose deadline is 23:00 on its date. | Generator |
| BR-040 | Only the assignee may mark a chore done. | RLS + API |
| BR-041 | A chore may not be marked done more than 24 hours before its window opens. | API |
| BR-042 | A chore may be marked done after its deadline, up to 48 hours late; it is accepted but flagged `late` and earns 50 percent of its points. | API + points posting |
| BR-043 | No confirmer may be the assignee, on any confirmation row. | Check constraint + trigger |
| BR-044 | A guest's chore may be confirmed by any member, including the host. | API |
| BR-056 | **A chore needs a confirmation quorum sized to the Home**, not a single peer: 1 eligible confirmer → 1; 2 eligible → 1; 3–5 eligible → 2 including an Admin or Co-Admin; 6 or more eligible → 3 including an Admin or Co-Admin. | Quorum calculator |
| BR-057 | The quorum is computed and stored on the assignment when it is marked done. Membership changing during the window does not move it. | Trigger on `done_pending` |
| BR-058 | Where the quorum requires a lead, no number of non-lead confirmations completes it. The lead may confirm at any point in the sequence. | Completion trigger |
| BR-059 | A guardian may not confirm their dependent's chore, and is excluded from the eligible count that sizes the quorum. | API + quorum calculator |
| BR-073 | One rejection ends the quorum immediately, whatever confirmations have been collected. | API |
| BR-074 | Auto-confirmation applies at every Home size and every quorum, and leaves `confirmed_by` null with `auto_confirmed = true`. | Cron job |
| BR-075 | A Home may set `confirmation_policy` to `single` (one other person, no lead) or `off` (marking done confirms). A Family Home defaults to `single`. | Settings |
| BR-076 | **Marking a chore done is one action.** From Today or from the schedule, a single tap moves the instance to `done_pending`. A photo, a note and any confirmation step happen after that transition and never gate it: an instance is never held in an intermediate "validate" state waiting for the assignee to supply something. Carries CE-12. | API + UI contract |
| BR-077 | **A template's last-completed figure counts confirmed completions only.** A `done_pending` instance shows as pending, not as done, and a rejected one never becomes the last-completed. A template with no confirmed completion reads "never completed" and never falls back to its creation date. The figure is derived from `chore_instances`, never stored. Carries CH-12. | Query — no stored column |
| BR-078 | **A shared instance divides its points exactly.** Where an instance has more than one assignee, each share is `floor(points / n)` and the last share absorbs the remainder, so `Σ shares = the template's points` with no rounding loss. Shares are snapshotted on the assignment like any other points (BR-034). Carries CE-11. | Check constraint + points calculator |
| BR-079 | **Every shared assignee is accountable and none may confirm.** A miss debits each assignee their own share; the confirmation quorum excludes all of them, not only the one who tapped Done (BR-043). Where excluding them leaves no eligible confirmer, the instance auto-confirms at the window rather than blocking. A swap or a release moves one member's share, not the whole instance. Carries CE-11. | Check constraint + quorum calculator |
| BR-045 | Auto-confirmation occurs `house_settings.auto_confirm_hours` after `done_at`, and only from `done_pending`. | Cron job |
| BR-046 | A rejection within the window returns the chore to `assigned` with the deadline extended 24 hours and `retry_count` incremented. | API |
| BR-047 | A second rejection sets `missed`. There is no third attempt. | API |
| BR-048 | A rejection reason of at least 10 characters is required. | API |
| BR-049 | Rejecting a chore that has already auto-confirmed is refused. The confirmation window is final. | API |
| BR-050 | A swap request expires 24 hours after creation, or at the chore's window start, whichever is sooner. | Cron job |
| BR-051 | An accepted swap transfers the assignment and its points in full. There is no partial credit to the original assignee. | API |
| BR-052 | A chore may be released to the open pool only before its window starts. | API |
| BR-053 | Claiming an open chore is first-come-first-served; a losing claim returns 409. | API, `SELECT … FOR UPDATE` |
| BR-054 | A chore in the open pool at its deadline is marked `missed` and attributed to nobody. Its points are removed from the week's total for target purposes. | Cron job |
| BR-055 | A cancelled assignment (admin action) earns no points and does not count as missed. | API |

### 1.5 Effort and penalties

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-060 | Points post exactly once, on the transition into `confirmed`. | Trigger with a transition guard |
| BR-061 | The weekly ledger closes before the next week is generated, in the same transaction. | Generation job |
| BR-062 | Carry adjusts the following week's target, clamped to ± `carry_cap_percent` of base target. | Target calculator |
| BR-063 | A member absent for the entire week has a target of zero and neither accrues nor discharges carry. | Target calculator |
| BR-064 | A member who joins mid-week has their first-week target prorated by remaining days. | Target calculator |
| BR-065 | The month's penalty uses the sum of `carry_out` across the weeks whose Monday falls within the month. | Penalty calculator |
| BR-066 | A member ending the month in surplus never owes a penalty, regardless of individual bad weeks. | Penalty calculator |
| BR-067 | When no member is in surplus, collected penalties are distributed equally across all active members instead. | Penalty calculator |
| BR-068 | When no member is in deficit, no penalties are computed and no credits are issued. | Penalty calculator |
| BR-069 | With the penalty rate set to zero, penalties compute and display but produce no monetary effect. This is shadow mode. | Penalty calculator |
| BR-070 | A member who joined mid-month has their deficit prorated by the days they were a member. | Penalty calculator |
| BR-071 | **Every points figure is openable and its components sum to it exactly.** Earned, target, carry, game points, streak and badge count each return the dated records that produced them — assignments, confirmations, rejections, misses and their point weights — and the sum of those components equals the figure displayed. A mismatch is a defect at the same severity as a split that does not sum. Carries EF-12. | Explain query + property test |
| BR-072 | **The explanation is derived, not stored.** It is a query over the same rows the figure is computed from, so a figure and its explanation cannot disagree. It names the confirming and rejecting members, not only the numbers, and it explains a zero as readily as a total. Carries EF-12. | Query — no audit copy |

### 1.6 Expenses

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-080 | An expense amount is greater than zero and at most ₹10,00,000 (100,000,000 paise). | Check constraint |
| BR-081 | An expense date may not be in the future. | API |
| BR-082 | An expense date may be at most 180 days in the past. | API |
| BR-083 | The payer must be an active member on the expense date. | API |
| BR-084 | An expense above `expense_approval_threshold_paise` enters `pending_approval` and is excluded from balances until approved. | API |
| BR-085 | The approver must not be the payer. | Check constraint |
| BR-086 | One approval is sufficient. | API |
| BR-087 | A rejected expense is excluded from all balances permanently, but remains visible with its rejection reason. | API |
| BR-088 | Splits are computed at creation and stored. They are not recomputed on read. | API |
| BR-089 | Editing an expense's amount, date or split basis recomputes and replaces its splits, and requires re-approval if it crosses the threshold. | API |
| BR-090 | An expense may be edited or voided only while its period is open. | Trigger |
| BR-091 | Voiding requires a reason and preserves the record with `status = 'void'`. | API |
| BR-092 | Split shares sum exactly to the expense amount, always. | Deferred constraint trigger |
| BR-093 | A rounding remainder is distributed one paisa at a time in ascending member-id order, deterministically. | Split calculator |
| BR-094 | A custom split must name only members active on the expense date, contain no negative amounts, and sum exactly to the total. | API |
| BR-095 | A guest's share is added to their host's row, and recorded separately in `guest_share_paise` for transparency. | Split calculator |
| BR-096 | A recurring expense posts on its `day_of_month` at 06:00 house time. A month shorter than the configured day is impossible, since the day is capped at 28. | Cron job |
| BR-097 | A recurring expense that fails to post is retried on the next daily run, and does not double-post — enforced by a uniqueness check on (`recurring_id`, `period_id`). | Cron job |
| BR-098 | Deactivating a recurring expense stops future posting and leaves posted instances alone. | API |

### 1.7 Periods and settlement

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-100 | A period is created lazily, on the first expense dated within it. | API |
| BR-101 | Exactly one period per house per calendar month. | Unique constraint |
| BR-102 | A period may not be closed while any expense in it is `pending_approval`. | API |
| BR-103 | A period may not be closed before its last day has passed. | API |
| BR-104 | Closing computes balances, applies penalties, generates settlements, and moves the period to `closing`. | API |
| BR-105 | A period moves to `closed` only when every settlement in it is `confirmed`. | API |
| BR-106 | A `closed` period rejects all writes to its expenses. | Trigger |
| BR-107 | `Σ final_net` across all members equals exactly zero. A non-zero sum blocks the close. | Settlement, asserted |
| BR-108 | Settlement amounts are always positive; direction is expressed by `from` and `to`. | Check constraint |
| BR-109 | Only the payer may mark a settlement paid; only the receiver may confirm it. | API |
| BR-110 | A settlement may be un-marked by its payer while it is `marked_paid` but not yet `confirmed`. | API |
| BR-111 | A confirmed settlement is final. | API |
| BR-112 | Reopening a closed period recomputes balances and issues *delta* settlements — the difference from what was already settled, not a fresh full set. | API |
| BR-113 | Every reopen increments `reopen_count` and writes an activity log entry naming the admin. | API |
| BR-114 | An expense dated in a closed period cannot be saved directly. The API returns the two options and the client must choose. | API |
| BR-115 | Under carry-forward, the expense is stored in the current open period, flagged as an adjustment, and split against the membership, occupancy and guests as they stood on the original date. | Split calculator |
| BR-116 | An adjustment expense appears in the current period's totals and in the original month's historical view, labelled in both. | Query layer |

### 1.8 Notifications

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-120 | No notification is sent inside a member's quiet hours, except settlement notifications, which are always delivered. | Dispatcher |
| BR-121 | A chore reminder is sent 30 minutes before its window opens, or at the window start when the window is under an hour. | Dispatcher |
| BR-122 | A member receives at most 6 push notifications per day. Excess is coalesced into one digest. | Dispatcher |
| BR-123 | A push subscription returning 404 or 410 is deleted immediately. | Dispatcher |
| BR-124 | Every notification is written to the in-app feed regardless of whether push delivery succeeded. | Dispatcher |
| BR-125 | Escalation on a missed chore: at the deadline, a private reminder; 2 hours later, a house-feed entry; at week close, the penalty. | Dispatcher |

### 1.9 AI

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-130 | An LLM schedule proposal is accepted only if it passes every hard constraint and its maximum deviation from target is within 115 percent of the deterministic solver's. | Validator |
| BR-131 | A rejected proposal is discarded whole. There is no repair, no partial merge. | Validator |
| BR-132 | Natural-language parsing never writes. It returns a proposal that the user must confirm. | API |
| BR-133 | A parse below 0.7 confidence is returned with `requires_review: true` and the form is pre-filled but not submittable without a field being touched. | API |
| BR-134 | The LLM payload contains member ids, first names, points, times and chore metadata only. Any other personal field is a defect. | Adapter + test |
| BR-135 | An LLM failure of any kind is logged and degrades silently. No user-facing error is raised for a background LLM call. | Adapter |
| BR-136 | AI capabilities are individually switchable per Home. A capability that is off behaves exactly as if no key were configured, for that feature alone. | Adapter |
| BR-137 | **AI has no write path to money, permissions, rules, approvals, chore allocation or settlement.** Every model output enters as a proposal a person confirms or a validator accepts. | Architecture, and a test asserting no AI-authored row exists in any of those tables |
| BR-138 | A rule parse produces a proposal and stores nothing. A rule reaches the database only when a person submits it. | API |
| BR-139 | An AI food suggestion that duplicates a library entry, contains a disliked item, names a restaurant or brand, or returns other than exactly two ideas causes the whole AI half to be dropped. The library half still renders and no error is shown. | Validator |

### 1.10 Governance and decisions

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-140 | Every action is Normal, Important or Critical. The classification is the Home's governance policy, with the documented defaults. | Policy |
| BR-141 | **Nothing changes while a decision is `waiting`.** The effect is applied at the transition into `applied` and never before. | `apply_decision` |
| BR-142 | `approved` and `applied` are separate states. A decision can be approved and then fail to apply; both facts are recorded. | Schema + apply function |
| BR-143 | **In a Home of two or more people, no single member's responses can move a Critical decision to `approved`.** | Resolver + participant selector, property-tested |
| BR-144 | The subject of a decision is never a participant in it. | Trigger on `decision_participants` |
| BR-145 | The proposer of a Critical decision is excluded from the counting pool, and is a mandatory approver in their own right. | Participant selector |
| BR-146 | One rejection from a required approver resolves the decision as `rejected`, whatever else has been collected. | Resolver |
| BR-147 | An acknowledger cannot reject. Acknowledgement gates an action and cannot refuse it. | Check constraint |
| BR-148 | A rejection requires a reason of at least ten characters. | Check constraint |
| BR-149 | A response is never revisable and never deleted. Changing your mind is a new decision. | No update or delete policy |
| BR-150 | A decision past its deadline is `lapsed`, takes no effect, and is kept. The hourly job does this whether or not anyone is logged in. | Cron |
| BR-151 | The required member count is capped at the number of eligible participants, so a policy can never create an unresolvable decision. | Participant selector |
| BR-152 | Approve All acts only on items the caller may approve, and never completes a Critical decision that other mandatory participants have not yet answered. | API + `apply_decision` as backstop |
| BR-153 | There is no Reject All. | API — absence of a route |
| BR-154 | Changing the governance policy is itself a Critical decision, and by default requires every Active adult member's acknowledgement. | API returns `DECISION_REQUIRED` |
| BR-155 | A Home with no Co-Admin drops the Co-Admin slot and raises the member requirement by one. A one-person Home auto-approves Critical decisions and records that it did so. | Participant selector |
| BR-156 | Closing a period, reopening one, removing a member, adjusting a balance, changing a rule, changing governance and changing the Home's money mode are Critical. Nothing else is, by default. | Policy |
| BR-157 | Every decision, response, expiry and result is written to History with actor and timestamp. | Trigger |
| BR-158 | A balance adjustment is a directed transfer between exactly two members and sums to zero. Historical expenses are never modified. | Schema + settlement |
| BR-159 | An adjustment exists only with a `decision_id`. | Not-null constraint |

### 1.11 Rules

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-180 | A rule's original text is stored verbatim and never rewritten. | Schema |
| BR-181 | **AI never activates a rule.** A parse produces a proposal; a person edits and submits it; governance activates it. | API + `activation_requires_decision` |
| BR-182 | A rule activates only through an approved decision. A version with `activated_at` set and no `decision_id` is refused. | Check constraint |
| BR-183 | Rules are individually editable and individually disableable. There is no combined rule object. | Schema — one row per rule |
| BR-184 | Editing a rule appends a version. Nothing is overwritten and nothing is deleted. | API |
| BR-185 | Disabling a rule is a version transition, not a delete. A rule in force in June is still readable, with its June values, in December. | API |
| BR-186 | An edit changes nothing until its decision applies. The current version stays in force meanwhile. | `apply_decision` |
| BR-187 | A rule is enterable through a structured form with no AI configured. Rules are not an AI-only feature. | UI + API |
| BR-188 | Version 2 executes exactly two structured kinds automatically: `chore_missed → reschedule`, and a weight or penalty feeding the effort and settlement engines. Every other rule is recorded and displayed. | Rules engine |
| BR-189 | A rule with a points or penalty weight affects effort and settlement only from its activation date. | Effort + settlement |

### 1.12 Food

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-200 | A meal is valid with only a name and a date. Nothing else is required. | API |
| BR-201 | **Recording food is never mandatory**, and no money flow requires it. | Architecture |
| BR-202 | Links between a meal and an expense are optional in both directions and cascade in neither. Deleting one leaves the other intact. | Nullable FKs, `on delete set null` |
| BR-203 | A meal creates an expense only on an explicit request, using the meal's participants as the split. | API |
| BR-204 | Per-person cost divides by **participants**, not by Home size. A meal with no participants has no per-person cost and says so. | Cost calculator |
| BR-205 | Participant shares sum exactly to the meal total, or there are no participants at all. | Deferred constraint trigger |
| BR-206 | A meal's total cost and name are stored, not derived. A later library rename or cost change never rewrites a past meal. | Schema |
| BR-207 | Library matching offers candidates and never merges silently. The final entry is always user-confirmed. | API + UI |
| BR-208 | A rating is per person per food or per item, never per meal instance. | Schema + unique indexes |
| BR-209 | An individual's preference overrides the Home's **for that individual's recommendations only**. The Home's own ranking is unchanged. | Recommender |
| BR-210 | One disliked item suppresses every meal containing it, for that person, without anyone tagging meals. | Recommender — `min` over item ratings |
| BR-211 | Suggestions are exactly two from the library and at most two from AI, visibly separated and never interleaved. | UI |
| BR-212 | The library recommender is deterministic. The same data always produces the same two suggestions in the same order, tie-broken by name. | Recommender |
| BR-213 | Fewer than five recorded meals returns the cold-start message and recent meals — never a fabricated score, and never a handover of the slot to AI. | Recommender |
| BR-214 | A food with a negative score is never suggested. | Recommender |
| BR-215 | Location is context for cuisine, season and price range. The system never asserts the availability, price or existence of a named restaurant. | Prompt + validator |
| BR-216 | Merging two library entries rewrites references and keeps both original names in History. | API |
| BR-217 | **A planned meal is an intention, not a record.** Placing a suggestion or a library meal on a future date creates no cost, no expense, no participants and no preference signal. It appears on the Calendar and nowhere in Insights, food history or the recommender's inputs. Carries FD-20. | API + recommender input filter |
| BR-218 | A planned meal becomes a real meal only when a member confirms it as eaten, at which point the ordinary meal rules (BR-200 onward) apply in full. An unconfirmed planned meal in the past is dropped from the Calendar and never becomes history. | API + cron |

| BR-219 | **A restriction is not a preference.** Allergy, intolerance and an absolutely-held diet are one concept with a severity, stored separately from ratings, and they remove a candidate from the recommendation set before scoring rather than weighting it within the score. | Recommender + schema |
| BR-220 | No combination of score terms surfaces a restricted food for the person it is restricted for. There is no threshold, no budget pressure and no cold-start path that relaxes the filter. | Recommender — property test |
| BR-221 | Recording a meal that contains an item at `allergy` severity for one of its **participants** is refused with `FOOD_RESTRICTION_VIOLATION`, naming the member and the item. It saves only once that member is removed from the participants. | Deferred constraint trigger |
| BR-222 | `intolerance` and `diet` severities warn on the meal form and save on explicit confirmation. They never block a record of something that actually happened. | API + UI |
| BR-223 | A food whose composition was never recorded cannot be proven safe. It is excluded for anyone holding an `allergy`-severity restriction and marked "composition unknown" for everyone else. | Recommender |
| BR-224 | If the restriction filter empties the candidate set, both halves of the recommendation return nothing with an honest message. The filter is never widened to fill the two slots, and the AI half is not called. | Recommender |
| BR-225 | The AI half receives the union of the participants' restricted items as an exclusion list, and **every returned idea is re-checked against that list on the way back**. A prompt is a request; the filter on our side is the guarantee. | Prompt + validator |
| BR-226 | A restriction is health information about one person. It is readable by that person and by a dependent's guardian, and by no one else — not a lead, not the Home. It appears in no digest, export, Insights response or Home-wide notification. | RLS + redaction contract |

### 1.13 Shopping list

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-230 | A shopping list is generated from upcoming meal plans and existing pantry items. It is not a standalone module. | API |
| BR-231 | Shopping items include name, quantity, unit and estimated price. All are optional except name. | API |
| BR-232 | Checked-off items persist for the current week and are archived at week end. | Scheduler |
| BR-233 | Shopping items can be linked back to the meal that generated them. The link is informational, not structural. | API |
| BR-234 | Multiple members can check off items; the list updates in real time for all members. | Realtime subscription |

### 1.14 Multi-currency

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-240 | An expense may carry `original_currency` and `original_amount_paise`. When set, the converted `amount_paise` uses the snapshotted exchange rate. | API |
| BR-241 | Each member's share is rounded individually before summation. The last share absorbs the rounding remainder so that `Σ shares = amount_paise` exactly. | Split calculator |
| BR-242 | When `original_currency` is null, the expense uses the house default currency. Multi-currency is opt-in per expense, not per house. | API |

### 1.15 Gamification

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-250 | Gamification is disabled by default. An Admin enables it; this requires Co-Admin acknowledgement. | house_settings |
| BR-251 | Points are awarded for: completing a chore (10), earning a badge (25), logging a home-cooked meal (5). Points are never deducted. | Effort engine |
| BR-252 | A streak counts consecutive days with at least one completed chore. Streaks are per-member, not compared across members. | Streak tracker |
| BR-253 | Badges are awarded at chore milestones (10, 50, 100 completions) and streak milestones (7, 30 days). Each badge is awarded at most once per member. | Badge evaluator |
| BR-254 | Gamification data is virtual-only. No real rewards, no monetary conversion, no linkage to chore targets or penalty rates. | Architecture |

### 1.16 Announcements

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-260 | Only Admins and Co-Admins can create announcements. Members see them but cannot create them. | RLS |
| BR-261 | An announcement has a title, body, severity (info, important, urgent) and an expiry time. It is removed from the Today screen after expiry. | API |
| BR-262 | Announcements are broadcast-only. There is no reply, reaction, or thread. | Architecture |

### 1.17 Complaints (chatbot feed)

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-270 | A complaint is surfaced by the chatbot with evidence, source, and a proposed action. It enters the same decision/approval flow as other decisions. | Chatbot + Decision engine |
| BR-271 | Complaints escalate: 24h warning → formal decision → settlement impact. The escalation path mirrors the chore penalty escalation. | Dispatcher |


### 1.18 Household financial position and the reserve

Carries EX-13, EX-14 and IN-09. Derived from the settlement arithmetic in
[06-ALGORITHMS.md](06-ALGORITHMS.md) section 6.5; it never reimplements it.

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-280 | An expected monthly contribution is optional, set per member, and **display-only**. It never charges anybody, never enters a split, and never changes a settlement figure. It exists so a member can see expected against actual. | API |
| BR-281 | Setting, changing or clearing an expected contribution is a governed decision. There is no route that edits another member's expected contribution directly. | API returns `DECISION_REQUIRED` |
| BR-282 | The position view shows `paid`, `fair share` and their difference using the same figures the settlement uses. The difference is `expense_net` under another name; the two views may never be computed separately. | Shared calculator |
| BR-283 | A reserve is a named pot with `balance = Σ contributions − Σ draws`, in integer paise. The balance may not go negative; a draw exceeding it is refused with the balance shown. | Check constraint |
| BR-284 | A reserve contribution is a real movement of that member's money: it increases their `paid` and the reserve balance in one transaction. | API + trigger |
| BR-285 | A draw pays a specific approved expense, and that expense's split is attributed to the reserve instead of to the members, so no member is charged for a cost the pot has covered. | Split calculator |
| BR-286 | **The reserve never nets against a member's personal position without an explicit draw.** A funded reserve reduces nobody's owed figure until the Home draws on it. | Settlement |
| BR-287 | Creating a reserve and every draw from it are governed decisions. A `reserve_movements` row of kind `draw` with `decision_id` null is refused. | Check constraint |
| BR-288 | `Σ variance(m) + reserve_balance = 0` for every period. A position view that does not balance blocks the close, exactly as a split that does not sum does. | Invariant test + close guard |

### 1.19 Product commitments

Carries the four commitments in [01-BRD.md](01-BRD.md) section 4.3 and their
technical form NFR-18, NFR-19 and NFR-20. These constrain every feature above;
they are not features themselves.

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-290 | **No product-level cap, daily quota, waiting period or paid tier gates recording.** An expense, a chore completion, an absence or a meal may be recorded at any time by any Active member. The abuse limits of SEC-10 are sized so ordinary household use never reaches them; a limit a real member hits during ordinary use is a defect to be raised, not a tier to be sold. Carries CM-1, NFR-18. | Rate-limit configuration + review |
| BR-291 | There is no premium tier and no advertising surface in the product. No feature is gated on payment and no screen promotes one. Carries CM-2. | Architecture — the absence of a billing path, and a test asserting that absence |
| BR-292 | **Export is permanent.** CSV of every Insights view, a full-history export of the Home's records, and the PDF settlement statement are always available to every Active member for their own and the Home's records. Removing, metering or tiering an export path is a breaking change requiring the same review as removing a requirement. Carries CM-3, IN-10, NFR-19. | API + gate on the export routes |
| BR-293 | **A record is reported as saved only after the server confirms the write.** A failed, timed-out or offline write surfaces the failure, preserves the entered values and stays retryable. Nothing is silently discarded and nothing is silently queued. Carries CM-4, NFR-20, E-25. | Client mutation contract + test |

### 1.20 Retention, erasure and the shared record

A Home's record is jointly authored. One member's departure or erasure request
cannot silently rewrite the arithmetic everybody else already settled against,
so erasure removes the **person**, not the Home's history of what was paid, owed
and done.

| ID | Rule | Enforced at |
|----|------|-------------|
| BR-294 | **Deactivating is not deleting.** Leaving a Home sets `left_date` and retains every row (BR-004). Nothing in the product deletes a Home's financial history as a side effect of a membership change. | API |
| BR-295 | A member may request **erasure of their account**. It succeeds only when they are financially clear in every Home (BR-167) and hold no live decision response that a Critical decision is still counting. Otherwise it is refused with `ERASURE_BLOCKED` naming the Home and the blocker. | API |
| BR-296 | Erasure removes the `users` row and every authentication credential, device, push subscription, notification, avatar, receipt image and rating they authored, and detaches their name. It **retains** the membership row, its splits, settlements, assignments and decision responses, with `display_name` replaced by a stable pseudonym — "Former member 3" — and `user_id` set null. Money that was settled stays settled. | API + cascade design |
| BR-297 | Erasure is irreversible and requires an explicit typed confirmation. It is never a side effect of a removal decision, and a removal decision never triggers it. | API + UI |
| BR-298 | **A Home is erased only when its last member leaves it.** The last member's departure deletes the Home and everything scoped to it, after a 30-day grace window in which any former member may restore it. Nothing about a Home outlives its last member past that window. | Cron + API |
| BR-299 | Retention windows for operational data: notifications 90 days, delivered push receipts 30 days, LLM request logs 30 days with prompts redacted per section 4 of [10-LLM-SPEC.md](10-LLM-SPEC.md), storage objects for the life of the record that references them. Financial records — expenses, splits, settlements, adjustments, decisions — are retained for the life of the Home and are not subject to a window. | Cron |
| BR-300 | Every export path of BR-292 returns the requester's own data in full, so the right to a copy is satisfied by a feature that already exists rather than by a manual process. | API |

---

## 2. Field validation

Client-side and server-side validation are identical, generated from one Zod schema per entity. The client validates for speed; the server validates because the client cannot be trusted.

### 2.1 User and member

| Field | Type | Rules | Error message |
|-------|------|-------|---------------|
| `display_name` | text | 2–50 chars, letters, spaces, hyphens, apostrophes | "Enter a name between 2 and 50 characters" |
| `email` | text | RFC-valid, lowercased, unique | "That email is already registered" |
| `password` | text | ≥ 8 chars, at least one letter and one digit | "Use at least 8 characters with a letter and a number" |
| `phone` | text | optional; 10 digits, or +country and 10–14 digits | "Enter a valid phone number" |
| `upi_vpa` | text | optional; matches `^[\w.\-]{2,256}@[a-zA-Z]{2,64}$` | "UPI ID looks like name@bank" |
| `residency` | enum | one of the three values | — |
| `invite_code` | text | exactly 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` | "That code isn't valid" |

### 2.2 Room

| Field | Rules | Error |
|-------|-------|-------|
| `name` | 1–30 chars, unique within the house | "A room with that name already exists" |
| `capacity` | integer 1–10 | "Capacity must be between 1 and 10" |
| `monthly_rent` | 0 to ₹5,00,000 | "Rent looks wrong — check the amount" |

### 2.3 Availability

| Field | Rules | Error |
|-------|-------|-------|
| `day_of_week` | integer 0–6 | — |
| `leaves_at` | time; required when `is_home` and `returns_at` is set | "Set both times, or choose home all day" |
| `returns_at` | time; must be after `leaves_at` | "Return time must be after leaving time" |
| window length | warn under 30 min, allow | "That leaves you under 30 minutes free — is that right?" |
| `exc_date` | not in the past, ≤ 90 days ahead | "Pick a date within the next 90 days" |

### 2.4 Chore template

| Field | Rules | Error |
|-------|-------|-------|
| `name` | 2–40 chars, unique within the house | "You already have a chore with that name" |
| `effort_points` | integer 1–100 | "Points must be between 1 and 100" |
| `duration_min` | integer 5–240 | "Duration must be between 5 and 240 minutes" |
| `times_per_week` | integer 1–7, required when frequency is `times_per_week` | "Choose how many times per week" |
| `room_id` | required when scope is `room` | "Pick which room this belongs to" |

### 2.5 Expense

| Field | Rules | Error |
|-------|-------|-------|
| `amount` | > 0, ≤ ₹10,00,000, at most 2 decimals | "Enter an amount above zero" |
| `expense_date` | not future, ≥ 180 days ago | "Date can't be in the future" |
| `category_id` | exists, active, belongs to this house | "Pick a category" |
| `description` | optional, ≤ 200 chars | "Keep the note under 200 characters" |
| `receipt` | JPEG, PNG or WebP; ≤ 5 MB before compression | "Use a JPG or PNG under 5 MB" |
| `custom_shares` | each ≥ 0; sum exactly equals amount | "Shares add up to ₹X, but the expense is ₹Y" |

### 2.6 Guest

| Field | Rules | Error |
|-------|-------|-------|
| `name` | 2–50 chars | "Enter the guest's name" |
| `from_date` | ≥ today − 7 days | "Guest dates can't be more than a week in the past" |
| `to_date` | ≥ `from_date`, ≤ `from_date` + 30 days | "A guest stay can be at most 30 days" |
| overlap | a guest with the same name and overlapping dates is refused | "That guest is already registered for those dates" |

### 2.7 Decision

| Field | Rules | Error |
|-------|-------|-------|
| `type` | one of the eleven decision types | — |
| `reason` | required for Critical, 10–500 chars | "Say why, in a sentence or two" |
| `subject_id` | must exist, belong to this Home, and not be the proposer where the type has a member subject | "You can't propose that about yourself" |
| response `reason` | required on reject, ≥ 10 chars | "Give a reason of at least 10 characters" |
| `deadline` | 1–30 days ahead | "Pick a deadline within the next 30 days" |

### 2.8 Rule

| Field | Rules | Error |
|-------|-------|-------|
| `title` | 3–60 chars, unique within the Home | "You already have a rule with that name" |
| `original_text` | 10–1000 chars | "Write the rule in a sentence or two" |
| `condition`, `action` | valid against the kind schema where the kind is one of the executed two; free-form otherwise | "That condition isn't one the app can act on — it will be recorded as a written rule" |
| `weight_points` | optional, integer 1–100 | "Points must be between 1 and 100" |
| `penalty_paise` | optional, ₹0–₹10,000 | "That penalty looks wrong — check the amount" |
| `ends_on` | optional, ≥ `starts_on` | "The end date must be after the start date" |

### 2.9 Meal

| Field | Rules | Error |
|-------|-------|-------|
| `name` | 2–60 chars | "Give the meal a name" |
| `meal_date` | not future, ≥ 365 days ago | "Date can't be in the future" |
| costs | each ≥ 0, total ≤ ₹1,00,000 | "That total looks wrong — check the amounts" |
| `participants` | 0 or more; each named at most once | "That person is already on this meal" |
| `items` | 0–30 items, each 1–40 chars | "Keep it to 30 items" |
| `photo` | JPEG, PNG or WebP; ≤ 5 MB before compression | "Use a JPG or PNG under 5 MB" |

### 2.10 Join request

| Field | Rules | Error |
|-------|-------|-------|
| `message` | optional, ≤ 200 chars | "Keep the note under 200 characters" |
| token | valid, unrevoked, unexpired | "This link is no longer active — ask for a new one" |
| duplicate | no live request already exists for this person and Home | "You've already asked. They'll answer soon." |

---

## 3. Edge cases

Each case states the situation, the required behaviour, and where it is handled. These are the cases that turn a working prototype into a system that survives a real house.

### 3.1 Household composition

| # | Situation | Required behaviour |
|---|-----------|--------------------|
| E-01 | The house has exactly one member | Targets equal the entire workload. Peer confirmation is impossible, so every chore auto-confirms immediately rather than after 48 hours. Settlement produces zero payments. |
| E-02 | The house has two members | Confirmation works normally. Settlement produces at most one payment. |
| E-03 | Every member is away for a whole week | Total target is zero. No assignments are generated. The week's ledger rows are written with zeros. No penalties arise. |
| E-04 | A member joins mid-week | Their first target is prorated by remaining days. They receive assignments only from their join date. |
| E-05 | A member leaves mid-month | They are excluded from splits after `left_date`, included before it, and included in that month's settlement. |
| E-06 | The last admin tries to leave | Refused. They must promote another member first. |
| E-07 | Everyone is in effort deficit at month end | Penalties are collected from all, and BR-067 distributes the pool equally, which returns roughly what each paid. The net effect is near zero, which is correct — a house that all underperformed equally owes itself nothing. |
| E-08 | Everyone is in effort surplus | No penalties. The pool is zero and no credits are issued. |
| E-09 | A member has no room | Excluded from room-rent splits, included in all equal splits, and eligible only for house-scoped chores. |
| E-10 | A room's occupants all leave | The room becomes vacant and its rent falls to the whole house per BR-013. |

### 3.2 Scheduling

| # | Situation | Required behaviour |
|---|-----------|--------------------|
| E-11 | No member can cook, but a cooking chore exists | Every cooking instance goes to the open pool and the admin is notified with the specific reason: "No member is marked as able to cook." |
| E-12 | The workload exceeds total capacity | Generation assigns what fits, marks the rest open, and warns the admin: "This week needs 3,400 minutes but the house has 2,900 available." |
| E-13 | One member has vastly more capacity than everyone else | The equal-target rule still applies. They are not given more points, only more choice of slot. |
| E-14 | A member's availability makes them eligible for nothing | Every constraint filters them out, so they receive no assignments and their target goes unmet, producing a deficit and a penalty. The admin is warned at generation time: "Suresh's availability makes him eligible for no current chores." This is deliberate — the alternative is letting an impossible schedule excuse non-participation. |
| E-15 | The generation job fails midway | The whole job runs in one transaction and rolls back. The next run, or a manual regeneration, produces the week. Members see last week's schedule until it succeeds. |
| E-16 | Generation runs twice for the same week | The second run is a no-op unless forced. Forced regeneration preserves confirmed and pending work. |
| E-17 | A guest is registered for a week already published | That week's remaining days are regenerated to include the guest's share. Days already past are untouched. |
| E-18 | A member declares away for a day that already has a confirmed chore | The confirmed chore stands and its points remain. Only `assigned` chores on that date redistribute. |
| E-19 | Every eligible member for an instance is at their daily ceiling | The instance goes to the open pool. |
| E-20 | The week contains a public holiday | Not modelled. Members declare a `home_all_day` exception if their pattern changes. |

### 3.3 Chore lifecycle

| # | Situation | Required behaviour |
|---|-----------|--------------------|
| E-21 | Two members confirm the same chore simultaneously | The first write wins; the second returns 409 with "Already confirmed by Kumar". Points post once. |
| E-22 | The assignee marks done and immediately deletes their account | The assignment remains and stays confirmable. Points post to the departed member's ledger and count toward that period. |
| E-23 | A chore is rejected 47 hours after being marked done | Allowed — the window is still open. The retry deadline is set 24 hours out. |
| E-24 | A chore is rejected 49 hours after being marked done | Refused. It auto-confirmed at 48 hours and the window is closed. |
| E-25 | A member marks a chore done while offline | The current build cannot submit the mutation offline. It keeps the user on the record and shows the offline state so they can retry when connected. A future queue requires an explicit idempotency and conflict contract before this rule changes. |
| E-26 | The same chore is marked done twice | The second call is idempotent and returns the existing state. |
| E-27 | A swap is accepted after the window has started | Allowed until the deadline. The new assignee inherits the original deadline. |
| E-28 | A member releases a chore to the pool and nobody claims it | It is marked missed at the deadline and attributed to nobody. The releasing member keeps the deficit, since their target was never reduced. |
| E-29 | An admin reassigns a chore that is `done_pending` | Refused. It must be confirmed or rejected first. |
| E-30 | A guest does not perform their assigned chore | It is marked missed and the deficit is recorded against the host member per CE-09. |
| E-88 | Both members of a two-person Home are the shared assignees of one instance | Excluding them leaves no eligible confirmer, so the instance auto-confirms at the window rather than blocking forever (BR-079). |
| E-89 | A shared assignee swaps their share away | Only that share moves. The remaining assignees keep theirs, the instance keeps its total, and the confirmation exclusion follows the new assignee (BR-079). |
| E-90 | A chore is completed, then rejected, then completed again and confirmed | The last-completed figure shows the confirmed completion only. The rejected attempt never becomes the last-completed and stays in History (BR-077). |
| E-91 | A member taps Done with no signal | The tap is not reported as saved. The instance stays as it was, the failure is named, and the action is retryable (BR-293, E-25). |

### 3.4 Money

| # | Situation | Required behaviour |
|---|-----------|--------------------|
| E-31 | An expense of ₹0.01 across 8 members | One member receives 1 paisa, seven receive zero. The sum is exact. |
| E-32 | An expense is logged for a date on which the payer was not yet a member | Refused with "You weren't a member of this house on that date." |
| E-33 | An expense is logged on the last day of the month, one minute before close | Included. Close reads the ledger at the moment it runs. |
| E-34 | An expense is edited after the settlement has been generated but before the period locks | Refused. The period is `closing`; only settlement actions are permitted. |
| E-35 | Two members log the same expense twice | Both stand. Duplicate detection warns at entry — "A ₹1,240 groceries expense was added 5 minutes ago by Kumar. Add anyway?" — but never blocks. |
| E-36 | A member has no UPI ID at settlement | The payment appears without a deep link, showing "No UPI ID — pay by any means and mark it here." |
| E-37 | A payer marks paid but the receiver never confirms | The period stays in `closing`. After 7 days, both parties are reminded daily. The admin may force-confirm, which is logged. |
| E-38 | An expense is voided after approval, in an open period | Its splits are deleted and balances recompute. Logged. |
| E-39 | The approval threshold is lowered after an expense was approved under the old one | The approved expense is unaffected. The threshold applies at creation time only. |
| E-40 | A recurring rent posts while the period is closing | It posts into the next open period, with its correct date. Recurring posting never forces a closing period open. |
| E-41 | A late expense is logged for a period that was already reopened once | Allowed. `reopen_count` increments again. There is no limit, but the admin sees the count. |
| E-42 | An adjustment expense's original month had a member who has since left | The split includes them, and they appear in the current settlement for that amount. |
| E-43 | Every member's net is exactly zero | Zero settlements are generated. The period closes immediately on confirmation of nothing, moving straight to `closed`. |
| E-44 | Rounding causes a 1-paisa discrepancy in netting | Impossible by construction: all arithmetic is integer paise and remainders are distributed. A discrepancy is a defect that blocks the close. |
| E-84 | A draw is proposed for more than the reserve holds | Refused at proposal time with the balance shown, so the Home is never asked to approve a decision that cannot apply (BR-283). |
| E-85 | A member with an expected contribution set pays nothing all month | Their position shows the full shortfall against expected. Nothing is charged: the expected contribution is display-only (BR-280), and only their fair share enters the settlement. |
| E-86 | The reserve is funded and a member is in deficit at close | The deficit stands. The pot does not absorb it — a reserve reduces nobody's position without an explicit draw (BR-286). |
| E-87 | A member leaves while the reserve holds money they contributed | Their contribution stays in the pot. Returning it is a draw, and therefore a governed decision like any other. Nothing is refunded automatically. |

### 3.5 System

| # | Situation | Required behaviour |
|---|-----------|--------------------|
| E-45 | The database is paused by the free tier | The heartbeat job prevents this. Should it occur, the app shows the offline strip and cached data. |
| E-46 | A push notification is sent to a member who uninstalled | The 410 response deletes the subscription; the in-app feed entry remains. |
| E-47 | The LLM returns malformed JSON | Parsed defensively, logged, discarded, deterministic path used. |
| E-48 | The LLM returns a valid schedule that assigns everything to one member | Rejected by the deviation check in BR-130. |
| E-49 | A member changes timezone by travelling | Irrelevant — all date logic uses the house timezone, never the device's. |
| E-50 | Two admins edit house settings simultaneously | Last write wins. Both are logged with their before-state. |
| E-51 | A member's session expires mid-form | The form state is preserved in session storage and restored after re-authentication. |
| E-52 | Clock skew between client and server | The server timestamp is authoritative for every state transition. Client times are never trusted for deadlines. |

### 3.6 Governance

| # | Situation | Required behaviour |
|---|-----------|--------------------|
| E-53 | The Home has one person | Every Critical decision auto-approves and the record says so. There is nobody to ask, and pretending otherwise would deadlock the Home. |
| E-54 | The Home has two people and no Co-Admin | The other person is a required participant. One person still cannot complete a Critical decision. |
| E-55 | The Admin proposes their own removal | Allowed. They are the subject, so they are excluded from the participants, and the decision needs the rest of the Home. If they are the last Admin, the decision cannot apply and says so at proposal time. |
| E-56 | A required participant is removed while a decision is waiting | They are dropped from the participants and the requirement is recomputed against the new eligible set. A decision must not become unresolvable because somebody left. |
| E-57 | A required participant is on an approved absence | They remain required. Being away does not remove somebody from a decision about money they are part of. The deadline handles the unresponsive case. |
| E-58 | Two people respond simultaneously and both would complete the decision | The resolution runs inside the response transaction with the decision row locked. One completes it; the other is recorded as a response to an already-resolved decision and returns 409. The effect applies once. |
| E-59 | A decision is approved and its effect no longer applies | It resolves `approved`, application fails, `apply_error` is stored, the proposer is notified with the specific reason, and nothing is half-applied. |
| E-60 | A settlement close is approved four days after it was proposed | The settlement is computed at apply time, from apply-time data, and the result records what was written. The preview shown at proposal time was a preview. |
| E-61 | Nobody responds to a rule change | It lapses. The current version stays in force. The Admin may propose it again, and the new decision references the lapsed one. |
| E-62 | The policy asks for four approvals in a Home with three eligible people | The requirement is capped at three, and the interface says it was capped. A policy must never create a decision that cannot resolve. |
| E-63 | A member tries to approve twice | 409. A response is a fact about what somebody said, and there is no update policy on the table. |
| E-64 | An expense needs approval and the only other member is inactive | The expense stays pending and blocks the close, which is correct. The Home's answer is to accept somebody or lower the threshold — not for the app to approve it. |
| E-65 | Approve All is tapped on a queue where the last item would close the month | That item is excluded, the rest are approved, and the response names why it was skipped. |

### 3.7 Membership

| # | Situation | Required behaviour |
|---|-----------|--------------------|
| E-66 | Somebody opens a revoked invite link | "This link is no longer active — ask for a new one." It never reveals whether the Home exists. |
| E-67 | Somebody requests to join a Home they are already in | They are routed straight in. No duplicate request is created. |
| E-68 | Somebody requests, is declined, and requests again | Allowed. Both requests are kept, and the lead sees that they have asked twice. |
| E-69 | A requested person queries any table directly | Zero rows, from every table, including their own request. RLS requires `status = 'active'`. |
| E-70 | A removal is approved for a member with ₹1,240 outstanding | They become `inactive`, flagged, keep appearing in the money views, and are removed automatically once the last settlement is confirmed. |
| E-71 | That member's outstanding amount is later cleared by a balance adjustment | The same completion path runs. The daily job catches anything the trigger missed. |
| E-72 | A person is in four Homes and one of them removes them | The other three are unaffected. Role and membership are per Home. |
| E-73 | The last Admin is the subject of an approved removal | The removal cannot apply. `apply_error` says "Promote another admin first", and the decision stays `approved` until an Admin exists or it is cancelled. |

### 3.8 Food

| # | Situation | Required behaviour |
|---|-----------|--------------------|
| E-74 | A meal costs ₹100 across three people | ₹33.34, ₹33.33, ₹33.33 — the remainder distributed one paisa at a time, summing exactly. |
| E-75 | A meal has no participants recorded | No per-person cost. The screen says "Who ate it?" rather than showing a figure derived from a guess. |
| E-76 | A meal is linked to an expense and the expense is voided | The meal is untouched. Its link is cleared. |
| E-77 | Four spellings of one dish are entered over a month | Each entry offers the existing match. If somebody declines every time, four entries exist and a lead can merge them, which keeps both names in History. |
| E-78 | The Home has recorded three meals | The library half shows the cold-start message and the three meals. It does not rank them, and the AI half is unaffected. |
| E-79 | Every library food scores negative for one person | Their library half is empty with "Nothing we've eaten looks right for you today." The AI half still renders. |
| E-80 | AI returns "Order from Anjappar, ₹240" | The whole AI half is dropped. A named restaurant is a claim about the world the system cannot verify. |
| E-81 | AI returns a meal already in the library | The AI half is dropped. Its job is new ideas; a duplicate means the call added nothing. |
| E-82 | A guest ate a meal and is a participant | They are a head in the per-person cost. No debt is created, so a head with no paying carrier is allowed here — unlike an expense split. |
| E-83 | A member rates a food, then changes their mind | The rating is replaced. Preferences are current opinions, not history. |

### 3.9 Restrictions, invite links and erasure

| # | Situation | Required behaviour |
|---|-----------|--------------------|
| E-84 | A food is the Home's highest-scoring suggestion and contains an item Arun is allergic to | Arun never sees it, at any score. The rest of the Home's suggestions are unchanged — the filter is per person, applied before ranking. |
| E-85 | Everything in the library is restricted for somebody eating tonight | Both halves are empty with "Nothing in the library is safe for everyone eating tonight." The filter is not relaxed and AI is not called (BR-224). |
| E-86 | A restaurant meal with no recorded items is a candidate, and one person has a peanut allergy | Excluded for that person, shown to everybody else marked "composition unknown". |
| E-87 | Somebody records last night's biryani with Arun as a participant, and Arun is allergic to an item on it | Refused with `FOOD_RESTRICTION_VIOLATION` naming Arun and the item. Removing Arun from the participants saves it. The meal happened; the record of Arun eating it is what is refused. |
| E-88 | A lead opens Insights and a member has three restrictions | Nothing about them appears. Restrictions are not aggregated, exported or digested (BR-226). |
| E-89 | Two people open the same invite link within the same second | Both raise a request. There is no seat to race for (BR-174). |
| E-90 | One person double-taps Request | One request. The second submission is answered with the first one's state, not an error (BR-175). |
| E-91 | Somebody opens an invite link rotated an hour ago, or one issued fifteen days ago | Both get the identical `INVALID_INVITE` response of E-66. Nothing distinguishes revoked from expired from never-existed. |
| E-92 | A member with ₹0 balance in one Home and ₹800 outstanding in another requests account erasure | Refused with `ERASURE_BLOCKED` naming the second Home. Erasure is all-or-nothing across Homes. |
| E-93 | A cleared member completes erasure, and a past settlement statement is reopened | The statement still balances. Their rows remain under "Former member 3"; only the person is gone (BR-296). |
| E-94 | The last member of a Home leaves | The Home enters a 30-day grace window, then it and everything scoped to it are deleted (BR-298). |

---

## 4. Error code catalogue

Every error the API can return, with its HTTP status and the message shown to the user.

### Authentication and access

| Code | Status | User-facing message |
|------|--------|--------------------|
| `UNAUTHENTICATED` | 401 | "Sign in to continue" |
| `NOT_HOUSE_MEMBER` | 403 | "You're not a member of this house" |
| `MEMBERSHIP_PENDING` | 403 | "Your admin hasn't approved you yet" |
| `ADMIN_REQUIRED` | 403 | "Only an admin can do that" |
| `NOT_YOUR_RECORD` | 403 | "You can only do that to your own items" |
| `INVALID_INVITE` | 404 | "This link is no longer active — ask for a new one" |
| `LAST_ADMIN` | 409 | "Promote another admin first" |
| `MEMBERSHIP_NOT_ACTIVE` | 403 | "You're not an active member of this home" |
| `MEMBERSHIP_REQUESTED` | 403 | "You're waiting to be accepted" |
| `ALREADY_REQUESTED` | 409 | "You've already asked. They'll answer soon." |
| `ALREADY_MEMBER` | 409 | "You're already in this home" |
| `LEAD_REQUIRED` | 403 | "Only an admin or co-admin can do that" |
| `ERASURE_BLOCKED` | 409 | "Settle up in {home} before deleting your account" |

### Governance

| Code | Status | Message |
|------|--------|---------|
| `DECISION_REQUIRED` | 409 | "This needs the house to agree. Propose it instead." |
| `NOT_A_PARTICIPANT` | 403 | "You're not one of the people this needs" |
| `ALREADY_RESPONDED` | 409 | "You've already answered this" |
| `DECISION_NOT_WAITING` | 409 | "This was already {status}" |
| `SUBJECT_IS_PARTICIPANT` | 422 | "You can't propose that about yourself" |
| `DECISION_ALREADY_OPEN` | 409 | "There's already one of these waiting" |
| `NOT_APPROVED` | 409 | "This hasn't been agreed yet" |
| `MANDATORY_RESPONSE_MISSING` | 409 | "Still waiting on {name}" |
| `ACKNOWLEDGER_CANNOT_REJECT` | 422 | "You can accept this or leave it — you can't refuse it" |
| `CRITICAL_NEEDS_DELIBERATE_ACTION` | 409 | "This one needs a closer look" |
| `APPLY_FAILED` | 409 | "The house agreed, but this can't be done now: {reason}" |

### Chores

| Code | Status | Message |
|------|--------|---------|
| `NOT_ASSIGNEE` | 403 | "Only the assigned person can mark this done" |
| `SELF_CONFIRM` | 403 | "You can't confirm your own chore" |
| `GUARDIAN_CANNOT_CONFIRM` | 403 | "You can mark {name}'s chore done, but somebody else has to confirm it" |
| `ALREADY_CONFIRMED_BY_YOU` | 409 | "You've already confirmed this one" |
| `NEEDS_LEAD_CONFIRMER` | 409 | "An admin or co-admin still needs to confirm this" |
| `ALREADY_CONFIRMED` | 409 | "Already confirmed by {name}" |
| `CONFIRM_WINDOW_CLOSED` | 409 | "This auto-confirmed 48 hours after it was done" |
| `TOO_EARLY` | 409 | "This isn't due until {time}" |
| `TOO_LATE` | 409 | "This is more than 48 hours past its deadline" |
| `ALREADY_CLAIMED` | 409 | "Someone else claimed it first" |
| `SWAP_EXPIRED` | 409 | "That swap request has expired" |
| `CANNOT_REASSIGN_PENDING` | 409 | "Confirm or reject it first" |
| `REASON_TOO_SHORT` | 422 | "Give a reason of at least 10 characters" |
| `SHARE_SUM_MISMATCH` | 422 | "The shares add up to {x} points, but the chore is worth {y}" |

### Expenses and periods

| Code | Status | Message |
|------|--------|---------|
| `PERIOD_CLOSED` | 409 | "{Month} is closed. Carry this into {current month}, or ask an admin to reopen it." |
| `PERIOD_CLOSING` | 409 | "{Month} is being settled and can't be changed" |
| `PENDING_APPROVALS` | 409 | "{n} expenses still need approval" |
| `PERIOD_NOT_ENDED` | 409 | "You can close {month} from {date}" |
| `SELF_APPROVE` | 403 | "You can't approve your own expense" |
| `ALREADY_APPROVED` | 409 | "Already approved by {name}" |
| `SPLIT_MISMATCH` | 422 | "Shares add up to ₹{x}, but the expense is ₹{y}" |
| `NOT_MEMBER_ON_DATE` | 422 | "{Name} wasn't a member on {date}" |
| `FUTURE_DATE` | 422 | "Date can't be in the future" |
| `DATE_TOO_OLD` | 422 | "Date is more than 180 days ago" |
| `AMOUNT_OUT_OF_RANGE` | 422 | "Enter an amount between ₹0.01 and ₹10,00,000" |
| `BALANCE_NOT_ZERO` | 500 | "Balances don't net to zero — closing blocked. Contact support." |

### Settlement

| Code | Status | Message |
|------|--------|---------|
| `NOT_PAYER` | 403 | "Only {name} can mark this paid" |
| `NOT_RECEIVER` | 403 | "Only {name} can confirm this" |
| `ALREADY_CONFIRMED_SETTLEMENT` | 409 | "This payment is already confirmed" |

### Rooms, availability, guests

| Code | Status | Message |
|------|--------|---------|
| `ROOM_FULL` | 409 | "{Room} is at capacity ({n} of {n})" |
| `ROOM_OCCUPIED` | 409 | "Move the occupants out first" |
| `INVALID_TIME_RANGE` | 422 | "Return time must be after leaving time" |
| `EXCEPTION_IN_PAST` | 422 | "Pick a date from today onward" |
| `GUEST_STAY_TOO_LONG` | 422 | "A guest stay can be at most 30 days" |

### System

| Code | Status | Message |
|------|--------|---------|
| `RATE_LIMITED` | 429 | "Slow down a moment and try again" |
| `AI_DISABLED` | 501 | "AI features aren't set up for this home" |
| `AI_CAPABILITY_OFF` | 501 | "This home has that AI feature switched off" |
| `MEAL_SHARE_MISMATCH` | 422 | "The shares add up to ₹{x}, but the meal cost ₹{y}" |
| `RESERVE_INSUFFICIENT` | 409 | "The reserve holds ₹{x}. That draw is for ₹{y}." |
| `RESERVE_DRAW_NEEDS_DECISION` | 409 | "The house has to approve a draw from the reserve" |
| `PLANNED_MEAL_NOT_EATEN` | 409 | "Confirm this was eaten before linking money to it" |
| `FOOD_RESTRICTION_VIOLATION` | 422 | "{name} can't eat {item}. Remove them from this meal or remove the item." |
| `RULE_NEEDS_DECISION` | 409 | "The house needs to acknowledge this before it takes effect" |
| `ADJUSTMENT_NEEDS_BOTH` | 409 | "Both people have to agree to this" |
| `VALIDATION_FAILED` | 422 | Field-level messages, from section 2 |
| `INTERNAL` | 500 | "Something went wrong. It's been logged." |

---

## 5. Default data created with a new house

Created automatically on house creation so that the app is usable before any configuration.

**Expense categories:** Groceries, Rent, Utilities, Gas, Internet, Maid, Eating out, Household, Other.

**Chore templates:**

| Name | Category | Points | Duration | Slot | Frequency | Notes |
|------|----------|-------:|---------:|------|-----------|-------|
| Cook dinner | cooking | 30 | 60 | evening | daily | requires cooking skill |
| Cook breakfast | cooking | 20 | 40 | morning | daily | requires cooking skill |
| Clean kitchen | kitchen_cleaning | 20 | 30 | evening | daily | |
| Wash dishes | kitchen_cleaning | 15 | 25 | evening | daily | |
| Clean bathroom | bathroom_cleaning | 25 | 30 | any | 2 per week | heavy |
| Mop common area | mopping | 15 | 20 | morning | 3 per week | |
| Clean common area | common_cleaning | 12 | 20 | any | 3 per week | |
| Take out rubbish | other | 5 | 5 | evening | daily | |
| Clean room | room_cleaning | 10 | 15 | any | weekly | one per room, room-scoped |

That workload is 787 points per week. For 8 members it produces a target of about 98 points each — roughly one substantial chore per day. The admin is shown this figure during setup and told to adjust it if it looks wrong for their house.

**Settings:** penalty rate ₹5.00 per point, approval threshold ₹1,000, auto-confirm 48 hours, generation Sunday 20:00, carry cap 50 percent, confirmation policy `size_aware`, LLM scheduling on.

**Governance policy:** Co-Admin required for Critical decisions, member requirement 50 percent by proportion, governance changes require everyone, absence and join approvers are Admin and Co-Admin, one expense approval, decision deadline 7 days, absence deadline 48 hours.

**Home rules:** none. A Home starts with no rules, deliberately — a seeded rule is one the Home did not write and did not agree to, which is the opposite of what the module is for. The rules screen's empty state suggests three the Home might want, as text to edit, not as rows to accept.

**Food:** an empty library. The Food screen's cold-start message does the teaching.

**AI capabilities:** all on where a key exists, all inert where one does not.

**A Family Home differs at creation:** `money_mode = 'pot'`, `penalty_enabled = false`, `confirmation_policy = 'single'`, no chore templates seeded beyond three light ones, and the Insights chore view titled Contribution.

**First-month recommendation shown to the Admin:** set the penalty rate to ₹0 for the first month. Everyone sees what they would have owed before any money changes hands. And promote a Co-Admin before inviting anybody — a Home with two leads is one where the governance defaults work as written, and a Home with one is one where every Critical decision leans harder on the members.
