# 05 — API Specification

**Product:** HouseOS
**Version:** 2.0
**Date:** 2026-08-28
**Style:** REST over Next.js Route Handlers, JSON in and out

---

## Implementation status

This document contains the intended contract for both shipped and planned
endpoints. **It is not evidence that a contract already has a route handler.**

As of 2026-08-28, `app/api/` contains **90** route files. Section 0 below lists
the shipped endpoints that this document does not otherwise specify, so that the
two can be reconciled by counting.

Two words are used precisely below. **Shipped** means a route handler exists.
**Verified** means a route handler exists and something automated exercises it —
which for most of section 2.1, 3 and 4 means an integration suite against the
local stack, and for four journeys means a Playwright test. A shipped endpoint
with no test is shipped, not verified, and this document does not claim
otherwise.

- **Shipped**, against specification 1.0: authentication (section 0.1), houses,
  members and dependents, rooms, availability, guests, chores, effort, expenses,
  categories, recurring, periods, settlements, notifications, receipts, the
  caller's own profile, AI credentials/providers/parse/digest, and **all five**
  `/api/analytics` endpoints — spend, members, effort, budgets and export.
- **Planned from specification 1.0, still without a route:** `GET
  /api/effort/me`, `GET /api/effort/penalties`, `POST /api/expenses/:id/reject`,
  `POST /api/expenses/:id/resolve-late`, and `GET /api/periods/:period`.
- **New in specification 2.0 and now shipped:** section 2.1 in full — `/api/homes`,
  `/api/homes/select`, `/api/invitations`, `/api/join-requests`, `/api/join/:token`;
  section 3 in full — `/api/decisions` with `respond`, `cancel`, `preview` and
  `approve-all`, plus the governed `/api/periods/:period/close` and `reopen`;
  section 4 in full — `/api/rules` with `parse`, `enable`, `disable` and
  `history`; the absence endpoints of section 5 — `/api/absences` with `preview`;
  and the AI capability switches, `/api/ai/capabilities`.
- **New in specification 2.0 and not yet built:** section 10 (food, including the
  restriction endpoints below — migration 081 is written and unapplied and there
  is no route yet), section 11 (calendar) and section 12 (insights, which
  supersedes the analytics routes rather than joining them). The account-erasure
  endpoint of section 2.2 is likewise specified and unbuilt.

`PROGRESS.md` remains the authority on what has actually been applied to a
database and what has actually been observed to run.

The current implementation uses `GET/PUT /api/availability` (not
`/api/availability/me`), and also exposes `GET /api/rooms`, both of which are
recorded below as implementation corrections.

## 0. Shipped endpoints not specified elsewhere in this document

These have route handlers today. They are recorded here so that the endpoint
summary in section 16 plus this section equals `app/api/`. Everything here is
specification 1.0 unless a row says otherwise.

### 0.1 Authentication

Supabase Auth owns sessions; these handlers exist because parts of the flow must
not run in a browser.

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/signup` | public | Create an account with an email, a password and a username |
| POST | `/api/auth/signin` | public | Sign in with **a username or an email**. Username-to-email resolution needs the service-role key and therefore never runs client-side (D-07). The failure message is identical for an unknown identifier and a wrong password. |
| GET | `/api/auth/username?u=` | public | Is this username free? Answers yes or no, and never who holds a taken name. |
| POST | `/api/auth/username` | signed in | Claim a username. This is the path a Google sign-in takes, since OAuth supplies no username. Uniqueness is settled by the database's unique index, not by the GET above. |
| GET | `/auth/callback?next=` | public | OAuth redirect target. Not under `/api`; it exchanges the code for a session and redirects. |

`POST /api/auth/signin` returns `BAD_CREDENTIALS` for both failure modes and
`EMAIL_NOT_CONFIRMED` when the account exists but is unconfirmed.

### 0.2 The caller's own record

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| PATCH | `/api/profile` | signed in | The caller's own profile. The cooking flag lives on the membership rather than the user and is applied separately. |
| DELETE | `/api/members/dependents/:id` | lead | Remove a dependent |

### 0.3 Receipts

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/api/receipts?path=` | member | Mint a **300-second signed URL** for a receipt. The bucket is private. The path is checked to start with the caller's `house_id` before Storage is asked, and the storage policy enforces the same rule independently. |

### 0.4 Chores, expenses and notifications — shipped extras

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/api/chores/pool` | member | The open pool — released instances anyone may claim |
| GET | `/api/chores/confirmations` | member | Instances waiting on the caller's confirmation |
| POST | `/api/expenses/preview` | member | Compute the split without writing anything |
| GET | `/api/expenses/:id` | member | One expense with its splits |
| GET | `/api/expenses/pending` | member | Expenses awaiting approval |
| GET | `/api/notifications?unread=true` | member | The in-app feed |
| POST | `/api/notifications/read` | member | Mark read |
| GET/PUT | `/api/notifications/prefs` | member | Per-category preferences and quiet hours |
| POST | `/api/notifications/snooze` | member | Snooze a notification |
| GET/POST/PATCH | `/api/categories`, `/api/categories/:id` | admin for writes | The Home's own categories and budgets |

### 0.5 Endpoints that specification 2.0 replaces

These ship today and must keep working until the phase that replaces them lands.
Nothing new should be built against them.

| Method | Path | Replaced by | Phase that removes it |
|--------|------|-------------|----------------------|
| POST | `/api/houses/current/invite-code` | `/api/invitations` (invite links, section 2.1) | 10 |
| POST | `/api/houses/join` | `POST /api/join/:token/request` (section 2.1) | 10 |
| GET | `/api/analytics/spend` | `GET /api/insights?type=money` | 15 |
| GET | `/api/analytics/members` | `GET /api/insights?type=money&member=` | 15 |
| GET | `/api/analytics/effort` | `GET /api/insights?type=chores` | 15 |
| GET | `/api/analytics/budgets` | `GET /api/insights/budgets` | 15 |
| GET | `/api/analytics/export` | `GET /api/insights/export` | 15 |

Phase 15's scope keeps `/analytics` aliased through the transition rather than
deleting it on the day Insights ships.

A planned endpoint must not be called from the web or native clients until its
route, authorisation, RLS coverage and tests exist.

## 1. Conventions

| Aspect | Rule |
|--------|------|
| Base path | `/api` |
| Authentication | Supabase JWT in the `Authorization: Bearer` header, or the session cookie for browser calls |
| Home context | Derived from the caller's **selected Home**, held server-side in the session, never taken from a request body. A request cannot name a Home it does not belong to. Switching is an explicit call (section 2.1). |
| Membership | Every house-scoped endpoint requires an **active** membership. `requested` and `inactive` are refused with `MEMBERSHIP_NOT_ACTIVE`, and receive no data in any shape. |
| Money in requests | Rupees as a decimal string (`"1240.50"`). Converted to paise at the boundary. |
| Money in responses | Both: `amount_paise` for computation and `amount_display` for rendering. |
| Dates | ISO `YYYY-MM-DD`, interpreted in the house timezone |
| Idempotency | Mutating endpoints accept an optional `Idempotency-Key` header |
| Validation | Zod schema per endpoint. A validation failure returns 422 with a field-level error map. |

### Error envelope

```json
{
  "error": {
    "code": "PERIOD_CLOSED",
    "message": "The July period is closed. Post this as an adjustment or ask an admin to reopen it.",
    "details": { "period": "2026-07" }
  }
}
```

| Status | Meaning |
|--------|---------|
| 400 | Malformed request |
| 401 | Not authenticated |
| 403 | Authenticated, but not permitted (wrong role, or acting on someone else's record) |
| 404 | Not found, or not visible to this member's house |
| 409 | Conflict with current state (period closed, chore already confirmed) |
| 422 | Validation failure |
| 429 | Rate limited |

---

## 2. Homes and membership

### `POST /api/houses`
Create a Home. The caller becomes its Admin.

```json
// request  — changed in 2.0: home_type and location
{ "name": "Chennai Flat", "home_type": "shared", "address": "...",
  "location": { "country_code": "IN", "state": "Tamil Nadu",
                "city": "Chennai", "area": "Anna Nagar" },
  "timezone": "Asia/Kolkata", "currency": "INR" }

// 201
{ "id": "uuid", "role": "admin",
  "invite_url": "https://app.example.com/join/7Yk2…" }
```

`location` is optional and is used as context for food suggestions and nothing
else (HM-03, SEC-18).

### `PATCH /api/houses/current/settings` — **admin**
Penalty rate, approval threshold, auto-confirm window, generation schedule,
confirmation policy, food budget, LLM toggle.

Changing `home_type`, `money_mode` or `penalty_enabled` is **not** available
here. Those are Critical decisions — `POST /api/decisions` with type
`change_home_mode` (409 `DECISION_REQUIRED` if attempted through this route).

### `GET /api/houses/current`
The full context for the caller's selected Home: Home, settings, governance
policy, rooms, active members with their room, role and residency, the caller's
own role, and the counts behind the navigation badges.

---

## 2.1 Multiple Homes, invites and joining — **new in 2.0**

### `GET /api/homes`
Every Home the caller is an Active member of, plus any Requested ones.

```json
{
  "selected_house_id": "uuid-a",
  "homes": [
    { "id": "uuid-a", "name": "Chennai Flat",  "home_type": "shared",
      "role": "admin",  "status": "active", "pending_count": 3 },
    { "id": "uuid-b", "name": "Friends House", "home_type": "shared",
      "role": "member", "status": "active", "pending_count": 0 },
    { "id": "uuid-c", "name": "Family Home",   "home_type": "family",
      "role": null,     "status": "requested", "pending_count": 0 }
  ]
}
```

A `requested` row carries `role: null` and nothing else about that Home — not its
member list, not its counts, not its settings.

### `POST /api/homes/select`
Set the caller's selected Home for this session.

```json
{ "house_id": "uuid-b" }
```
→ `200 { "selected_house_id": "uuid-b" }`, or `403 NOT_HOUSE_MEMBER` if the
caller is not Active there.

### `GET /api/invitations` · `POST /api/invitations` · `DELETE /api/invitations/:id` — **lead**
Read, rotate and revoke the Home's invite link. Rotating revokes the previous
link immediately and does not affect requests already raised or memberships
already accepted (SEC-15).

```json
// POST 201
{ "id": "uuid", "invite_url": "https://app.example.com/join/7Yk2…",
  "expires_at": null }
```

### `GET /api/join/:token`
Public, unauthenticated. What a person sees when they open an invite link,
before signing in.

```json
{ "house_name": "Chennai Flat", "home_type": "shared", "member_count": 7,
  "valid": true }
```

An invalid, expired or revoked token returns `404 INVALID_INVITE` with the same
body shape and `valid: false`. It never reveals whether the Home exists.

### `POST /api/join/:token/request`
The caller — signed in, any account — raises a join request.

```json
{ "message": "Ruth's friend, moving in on the 1st" }
```
→ `202 { "status": "requested", "house_name": "Chennai Flat" }`

This is the **only** path to membership (HM-06). There is no endpoint that
creates a member for somebody else, and adding one would be a defect.

### `GET /api/join-requests` — **lead**
Open requests for the selected Home.

```json
{ "requests": [
  { "id": "uuid", "display_name": "Karthik", "message": "…",
    "requested_at": "2026-08-25T18:02:00Z" }
] }
```

Members who are not Admin or Co-Admin see the **count** of requests through
`GET /api/houses/current`, and the muted "Requested" entries in the member list,
without the details (HM-07).

### `POST /api/join-requests/:id/accept` — **lead**
→ `201` with the created membership: `status: "active"`, `role: "member"`.

### `POST /api/join-requests/:id/decline` — **lead**
Requires a reason. The person may request again.

---

## 2.2 Members

### `GET /api/members`
All members with status, role, member kind, residency, room, cooking flag and
current effort standing. Requested people appear as muted entries with a name
and nothing else. Inactive people appear in their own group with any outstanding
amount stated.

### `PATCH /api/members/:id` — **admin for role, lead for the rest**
Change role (including promoting a Co-Admin), residency, `can_cook`, or a
dependent's flags.

**Changed in 2.0:** this route no longer deactivates or removes anybody. Removal
is a Critical decision — `POST /api/decisions` with type `remove_member`.
Attempting `{ "status": "inactive" }` here returns `409 DECISION_REQUIRED` with
the decision type to raise.

Demoting the last Admin returns `409 LAST_ADMIN`.

### `DELETE /api/members/:id` — **a proposer since phase 11**
It removes nobody. With a `reason` in the body it raises a `remove_member`
decision and answers `409 DECISION_REQUIRED` carrying `decision_id`; with no
body it answers the same code carrying what to propose and where. A client that
has not been updated therefore learns what happened rather than meeting a 404
and concluding the member is already gone (R-3).

The one exception is a Home with nobody to ask: the decision auto-approves, the
effect runs, and the answer is `200` in the shape the route always returned,
plus the `decision_id` that records it.

Since migration 056 there is no direct path either: an adult's `status` and
`left_date` may only be written by an applied decision effect or by the removal
job. A dependent stays on the Admin path — see
`DELETE /api/members/dependents/:id`.

### `DELETE /api/profile` — **the caller only, new in 2.0**

Erase the caller's account (D-65, BR-295 to BR-297). Requires a typed
confirmation in the body, so it cannot be reached by a stray request.

```json
{ "confirm": "DELETE MY ACCOUNT" }
```
→ `200 { "erased_at": "…", "homes_affected": 2, "pseudonym": "Former member 3" }`

Succeeds only when the caller is financially clear in **every** Home they belong
to. Otherwise:

```json
{ "error": "ERASURE_BLOCKED",
  "message": "Settle up in Kovai House before deleting your account",
  "blockers": [ { "home": "Kovai House", "reason": "unconfirmed_settlement", "amount_paise": 80000 } ] }
```

What it removes: the `users` row, credentials, devices and push subscriptions,
notifications, avatar, receipt images, ratings and restrictions. What it
**retains**: the membership row and its splits, settlements, assignments and
decision responses, under a stable pseudonym with `user_id` set null. A Home's
settled arithmetic does not change because one of its authors left (D-65).

Irreversible, and never a side effect of a removal decision — a Home cannot erase
somebody by vote.

### `POST /api/members/dependents` — **lead**
Create a resident with no account: name, `shares_cost`, `does_chores`, guardian.
The documented exception to HM-06, because there is nobody to send a link to,
and safe because a dependent has no permissions at all.

### `GET /api/rooms` · `POST /api/rooms` · `PATCH /api/rooms/:id` · `DELETE /api/rooms/:id` — **admin for writes**
Manage rooms. Deletion is soft and refused while the room has current occupants.

### `POST /api/rooms/:id/assign` — **admin**
Move a member into a room. Closes the previous `room_assignment` with `to_date = today` and opens a new one.

---

## 3. Governance, decisions and approvals — **new in 2.0**

The whole of [14-GOVERNANCE-SPEC.md](14-GOVERNANCE-SPEC.md), over six
endpoints. Every shared decision in the product goes through them; there is no
second approval API.

### `POST /api/decisions`
Propose a decision. The server determines the level and the participants from the
Home's governance policy — the client never sends them.

```json
// request
{ "type": "remove_member",
  "subject_id": "member-uuid",
  "reason": "Moving out at the end of the month, agreed in person",
  "payload": { "effective_date": "2026-09-01" } }

// 201
{ "id": "decision-uuid", "type": "remove_member", "level": "critical",
  "status": "waiting",
  "deadline": "2026-09-02T18:30:00Z",
  "requires": {
    "approvals": 4, "acknowledgements": 1,
    "mandatory": [
      { "member_id": "…", "name": "Ravi",  "capacity": "approver",     "role": "admin" },
      { "member_id": "…", "name": "Kumar", "capacity": "acknowledger", "role": "co_admin" }
    ],
    "counting": [ { "member_id": "…", "name": "Vinoth", "capacity": "approver" } ]
  },
  "responses": [] }
```

`422 SUBJECT_IS_PARTICIPANT` if the subject would be one of its own required
participants. `409 DECISION_ALREADY_OPEN` if an unresolved decision of the same
type already exists for the same subject. A Critical decision may only be
proposed by an Admin or a Co-Admin (`403 LEAD_REQUIRED`), which is the matrix's
"Admin (proposer), Co-Admin" column read as a rule.

### `POST /api/decisions/preview`
Who would be asked, before anybody is — the S-37 sheet. Takes `type` and, when
the decision is about somebody, `subject_member_id`; writes nothing and creates
nothing.

```json
// request
{ "type": "remove_member", "subject_member_id": "member-uuid" }

// 200
{ "level": "critical",
  "participantCount": 3,
  "requiredApprovals": 2,
  "requiredAcks": 1,
  "deadlineHours": 168,
  "autoApprove": false,
  "reasonRequired": true,
  "participants": [
    { "memberId": "…", "displayName": "Ravi",  "capacity": "approver",     "isMandatory": true },
    { "memberId": "…", "displayName": "Kumar", "capacity": "acknowledger", "isMandatory": true },
    { "memberId": "…", "displayName": "Asha",  "capacity": "approver",     "isMandatory": false }
  ] }
```

It runs the same selector the proposal will, so it raises the same refusals: a
proposal that could not be made is refused here rather than at Submit.

### `GET /api/decisions?status=&type=&mine=true`
List decisions in the selected Home. Every member can read every decision —
transparency is the product. `mine=true` filters to ones awaiting the caller's
own response.

```json
{ "decisions": [
  { "id": "…", "type": "close_settlement", "level": "critical", "status": "waiting",
    "requested_by": "Ravi", "subject": { "type": "period", "label": "August 2026" },
    "deadline": "2026-09-02T18:30:00Z",
    "progress": { "approvals": "0/0", "acknowledgements": "3/5" },
    "my_response": null, "my_capacity": "acknowledger" }
] }
```

### `GET /api/decisions/:id`
One decision in full: payload, the exact effect approving it would have, every
participant, every response with its timestamp and reason, and the result if it
has been applied.

### `POST /api/decisions/:id/respond`

```json
{ "response": "approve" }              // or "reject" with a reason, or "acknowledge"
```

```json
// 200
{ "status": "waiting",
  "progress": { "approvals": "3/4", "acknowledgements": "1/1" },
  "resolved": false }

// 200, when this response completed it
{ "status": "applied",
  "resolved": true,
  "result": { "member_id": "…", "outcome": "inactive_pending_settlement",
              "outstanding_paise": 124000 } }
```

Failure modes worth naming: `403 NOT_A_PARTICIPANT`, `409 ALREADY_RESPONDED` — a
response is not revisable — `409 DECISION_NOT_WAITING`, and `422 REASON_TOO_SHORT`
on a rejection under ten characters.

When resolution succeeds but application fails, the response is `200` with
`status: "approved"`, `resolved: true` and an `apply_error` string. The Home
agreed; the world moved. Both facts are kept.

### `POST /api/decisions/:id/cancel`
The proposer withdraws. Only while `waiting`.

### `GET /api/approvals`
The aggregated queue behind the Approvals surface — everything awaiting the
caller, from every source, in one call.

```json
{
  "total": 11,
  "groups": [
    { "kind": "expenses",       "count": 3, "approvable_now": 3 },
    { "kind": "chores",         "count": 2, "approvable_now": 2 },
    { "kind": "absences",       "count": 1, "approvable_now": 1 },
    { "kind": "join_requests",  "count": 2, "approvable_now": 2 },
    { "kind": "member_changes", "count": 1, "approvable_now": 0 },
    { "kind": "rules",          "count": 1, "approvable_now": 1 },
    { "kind": "adjustments",    "count": 1, "approvable_now": 0 },
    { "kind": "settlement",     "count": 1, "approvable_now": 0 }
  ],
  "items": [ /* each with its id, kind, summary, effect and my_capacity */ ]
}
```

`approvable_now` is the count Approve All would act on. It excludes Critical
decisions that would **complete** on the caller's response while other mandatory
participants are still outstanding — those are shown individually and require a
deliberate tap (AP-04).

### `POST /api/approvals/approve-all`

```json
// request
{ "kinds": ["expenses", "chores"] }        // optional; omit for everything eligible
```

```json
// 200
{ "approved": 5,
  "skipped": [
    { "id": "…", "kind": "settlement",
      "reason": "CRITICAL_NEEDS_DELIBERATE_ACTION" },
    { "id": "…", "kind": "member_changes",
      "reason": "AWAITING_OTHER_MANDATORY_PARTICIPANTS" }
  ] }
```

There is no Reject All. A rejection needs a reason, and a batch of identical
reasons is not a reason.

### `GET /api/governance/policy` · `PUT /api/governance/policy`
Read is open to every member — a policy people cannot read is not a policy.
Writing is itself a Critical decision: `PUT` returns `409 DECISION_REQUIRED`
naming `change_governance`, and the change is made by proposing it.

---

## 4. Rules — **new in 2.0**

### `GET /api/rules`
Every rule in the Home with its current version, in display order.

```json
{ "rules": [
  { "id": "…", "title": "Clean dishes after eating", "status": "active",
    "version_no": 2,
    "original_text": "Everyone should clean their own plates before sleeping.",
    "condition": { "kind": "time_of_day", "after": "dinner" },
    "action": { "kind": "task", "text": "Clean own dishes" },
    "applies_to": { "kind": "all" },
    "weight_points": null, "penalty_paise": null,
    "activated_at": "2026-06-04T…" }
] }
```

### `POST /api/rules/parse` — **admin**
Turn plain text into a structured proposal. **Stores nothing.**

```json
// request
{ "text": "Nobody should leave unwashed vessels overnight. If someone does it, they must clean the kitchen next morning." }

// 200
{ "parsed_by": "ai", "confidence": 0.88,
  "proposal": {
    "title": "Unwashed vessels overnight",
    "condition": { "kind": "state_at_time", "state": "unwashed_vessels", "at": "end_of_day" },
    "action": { "kind": "task", "text": "Clean the kitchen next morning" },
    "applies_to": { "kind": "responsible_person" },
    "weight_points": null, "penalty_paise": null
  } }
```

Without a key, or with `rule_parsing` disabled: `200` with
`{ "parsed_by": "manual", "proposal": null }` and the client shows the structured
form. **Not** an error — rules are not an AI-only feature (RL-08).

### `POST /api/rules` — **admin**
Submit a rule. Creates a `change_rule` decision and returns it; the rule itself
stays `draft` until that decision applies (RL-03, RL-04).

```json
// 201
{ "rule_id": "…", "status": "draft", "decision": { "id": "…", "status": "waiting" } }
```

### `PATCH /api/rules/:id` — **admin**
Edit. Same shape: a new version is prepared and a `change_rule` decision is
raised. Nothing changes until it applies.

### `POST /api/rules/:id/disable` — **admin**
Also a decision. Disabling is a version transition, not a delete.

### `GET /api/rules/:id/history`
Every version: who changed it, when, the old and new values field by field, the
reason, and who acknowledged the decision that activated it (RL-07).

---

## 5. Availability, absence and guests

### `GET /api/availability` · `PUT /api/availability`
Read or replace the caller's seven-day availability in one call.

```json
// PUT request
{
  "days": [
    { "day_of_week": 1, "is_home": true, "leaves_at": "09:30", "returns_at": "19:00" },
    { "day_of_week": 0, "is_home": true, "leaves_at": null, "returns_at": null }
  ]
}
```

Response includes the derived windows, so the member sees immediately what the system concluded:

```json
{
  "days": [ ... ],
  "derived": [
    { "day_of_week": 1, "morning_window_min": 210, "evening_window_min": 240, "total_min": 450 }
  ],
  "weekly_capacity_min": 2870
}
```

### `POST /api/availability/exceptions` · `DELETE /api/availability/exceptions/:id`
Declare a date as home all day or with different hours. **Changed in 2.0:**
declaring a date **away** now goes through `/api/absences`, because an away day
that excuses chores is a request the Home answers, not a fact one person asserts.

### `POST /api/absences/preview` — **new in 2.0**
What an absence would cost, before asking for it (AV-08). Writes nothing.

```json
// request
{ "from_date": "2026-08-28", "to_date": "2026-08-28" }

// 200
{ "affected": [
    { "assignment_id": "…", "chore": "Clean bathroom", "points": 25 },
    { "assignment_id": "…", "chore": "Cook dinner",    "points": 20 }
  ],
  "total_points": 45,
  "target_reduction": 15,
  "requires_approval": true }
```

### `POST /api/absences` — **new in 2.0**
Request an absence. Creates an `absence_request` and its decision.

```json
{ "from_date": "2026-08-28", "to_date": "2026-08-28",
  "reason": "Travelling to Trichy", "excuse_chores": true }
```
→ `201 { "id": "…", "status": "requested", "decision": { "id": "…", "status": "waiting" } }`

`excuse_chores: false` records the absence without asking for anything and needs
no decision — it resolves immediately and writes the exception.

### `GET /api/absences?status=&member=` · `POST /api/absences/:id/cancel`

On **approval**, the effect writes the `away` exceptions, redistributes that
day's outstanding assignments to whoever is furthest below target, reduces the
member's target proportionally, and returns the changes:

```json
{ "status": "approved",
  "reassigned": [ { "assignment_id": "uuid", "new_assignee": "Kumar" } ],
  "target_reduction": 15 }
```

On **rejection or lapse**, nothing moves. The member is away regardless — the
Home has simply declined to excuse the work, so the chores stay theirs and miss
normally (AV-06). The distinction between "I declared I would be away" and "I
didn't do the work" is the entire point of the flow, and the app must never
blur it.

### `POST /api/guests` · `GET /api/guests` · `DELETE /api/guests/:id`

```json
{ "name": "Arun", "from_date": "2026-08-29", "to_date": "2026-08-31",
  "counts_for_expense": true, "is_assignable": true }
```

Registering an assignable guest inside an already-published week regenerates that week's remaining days to include their share of the work.

---

## 6. Chores

### `GET /api/chores/templates` · `POST` · `PATCH /:id` · `DELETE /:id` — **admin for writes**

```json
{ "name": "Cook dinner", "category": "cooking", "effort_points": 30, "duration_min": 60,
  "slot": "evening", "scope": "house", "frequency": "daily",
  "requires_cooking_skill": true, "is_heavy": false }
```

Every template in the `GET` response carries its last-completed figure (CH-12),
read from `v_template_last_done`. Confirmed completions only; `last_done_at` is
`null` for a template never confirmed done, and the client renders that as
"never completed" rather than substituting a creation date (BR-077).

```json
{ "id": "…", "name": "Clean bathroom", "effort_points": 25,
  "last_done_at": "2026-08-21T19:40:00Z", "last_done_by": "Arun", "days_ago": 6 }
```

### `GET /api/chores/week?week_start=2026-08-24`
The full house week. Every member sees every assignment.

```json
{
  "week_start": "2026-08-24",
  "generated_by": "llm",
  "totals": { "points": 840, "unassigned": 0 },
  "members": [
    { "member_id": "uuid", "name": "Ravi", "target": 105, "assigned": 105, "confirmed": 40 }
  ],
  "days": [
    { "date": "2026-08-24",
      "assignments": [
        { "id": "uuid", "chore": "Cook dinner", "assignee": "Ravi", "slot": "evening",
          "window": ["19:30", "22:00"], "points": 30, "status": "assigned" }
      ] }
  ]
}
```

### `GET /api/chores/mine?from=&to=`
The caller's assignments only, ordered by window start.

### `POST /api/chores/generate` — **admin**
Force generation for a week. Idempotent: regenerating a week that already has confirmed work preserves the confirmed assignments and reshuffles only what is still outstanding.

```json
{ "week_start": "2026-08-24", "use_llm": true }
```
→
```json
{ "schedule_run_id": "uuid", "generator": "llm", "llm_accepted": true,
  "assignments_created": 47, "unassigned": 0,
  "rationale": "Ravi carried a 40-point surplus, so his target was reduced ...",
  "fairness": { "target_per_member": 105, "max_deviation": 8 } }
```

If the LLM proposal fails validation, `llm_accepted` is `false`, `generator` is `engine`, and `validation_errors` lists exactly which constraints were violated.

### `POST /api/chores/:id/done`
Mark done. Only the assignee, or any shared assignee (CE-11). Sets
`done_pending` and notifies the members whose confirmation the quorum requires.

**The body is entirely optional (CE-12).** A bare `POST` with no body is the
normal case: one tap from Today or from the schedule marks the chore done. A
photo or a note is attached afterwards, by a second call, and never gates the
first. An endpoint or a screen that requires anything before the transition is a
defect against BR-076.

```json
{ "photo_url": "https://.../receipt.jpg", "note": "kitchen floor too" }
```

### `POST /api/chores/:id/share` — **new in 2.0**
Share an instance between two or more assignees (CE-11). The instance's effort
points divide between them exactly, last share absorbing the remainder, and the
confirmation quorum then excludes all of them (BR-078, BR-079).

```json
{ "member_ids": ["…", "…", "…"] }
```
→ `200 { "shares": [ { "member_id": "…", "share_points": 8 },
                     { "member_id": "…", "share_points": 8 },
                     { "member_id": "…", "share_points": 9 } ] }`

Rejected with `422 SHARE_SUM_MISMATCH` if the division would not sum to the
instance's points — which is a server defect, not a client error, and is logged
as one.

### `POST /api/chores/:id/confirm` — **changed in 2.0**
Confirm someone else's chore. Rejected with `403 SELF_CONFIRM` if the caller is
the assignee, and with `403 GUARDIAN_CANNOT_CONFIRM` if the caller is the
guardian of a dependent assignee (D-24).

A confirmation contributes to the Home's **quorum** (CE-03) rather than
completing the chore outright. The response says where the chore now stands:

```json
// 200 — quorum not yet met
{ "status": "done_pending",
  "confirmations": { "received": 1, "required": 3, "needs_lead": true },
  "still_needed": "An admin or co-admin, and one more person" }

// 200 — this confirmation completed it
{ "status": "confirmed", "points_posted": 30,
  "confirmations": { "received": 3, "required": 3 } }
```

`409 ALREADY_CONFIRMED_BY_YOU` if the caller has already confirmed this chore.
The quorum was snapshotted when the chore was marked done, so it does not move
if somebody joins or leaves in between.

### `POST /api/chores/:id/reject`
Reject within the confirmation window, with a reason. First rejection returns the chore to `assigned` with the deadline extended one day; a second sets `missed`.

```json
{ "reason": "Kitchen counter was not wiped" }
```

### `POST /api/chores/:id/swap`
Request a swap with a named member.

```json
{ "to_member_id": "uuid", "message": "Late meeting on Tuesday" }
```

### `POST /api/swaps/:id/respond`
Accept or decline. On acceptance the assignee changes and the points move with the chore.

### `POST /api/chores/:id/release`
Move the chore to the open pool. The caller loses the points.

### `POST /api/chores/:id/claim`
Claim an open chore. First claim wins; a losing claim receives 409.

### `PATCH /api/chores/:id` — **admin**
Manual override of assignee, date or window.

---

## 7. Effort and fairness

### `GET /api/effort/leaderboard?period=2026-08`

```json
{
  "period": "2026-08",
  "rows": [
    { "member_id": "uuid", "name": "Ravi", "earned": 380, "target": 420, "carry": -40,
      "done": 14, "missed": 2, "completion_rate": 0.875, "rank": 1 }
  ],
  "house": { "total_points": 3360, "top3_share": 0.42 }
}
```

`house.top3_share` is the headline product metric from the BRD, exposed directly.

### `GET /api/effort/me?weeks=8`
The caller's weekly history: target, earned, carry, and the chores behind each number.

### `GET /api/effort/penalties?period=2026-08`
Projected penalties if the month closed now. Visible to everyone, deliberately — the warning is the point.

### `GET /api/effort/explain?figure=&member=&period=` — **new in 2.0**
The arithmetic behind any points figure (EF-12). `figure` is one of `earned`,
`target`, `carry`, `game_points`, `streak` or `badges`. The returned components
sum exactly to the figure; a mismatch is a defect at the severity of a split
that does not sum (BR-071).

```json
{
  "figure": "earned", "member": "Arun", "period": "2026-08", "value": 412,
  "components": [
    { "date": "2026-08-03", "kind": "confirmed", "source": "Clean bathroom",
      "delta": 25, "confirmed_by": ["Ruth", "Vijay"], "running_total": 25 },
    { "date": "2026-08-04", "kind": "shared", "source": "Mop common area",
      "delta": 8, "note": "shared with Karthik and Ruth", "running_total": 33 },
    { "date": "2026-08-06", "kind": "rejected", "source": "Wash dishes",
      "delta": 0, "rejected_by": "Ruth", "reason": "pans still in the sink",
      "running_total": 33 },
    { "date": "2026-08-07", "kind": "missed", "source": "Cook dinner",
      "delta": 0, "running_total": 33 }
  ]
}
```

Rows with `delta: 0` are returned deliberately. "Why do I have 412 and not 470"
is the question members actually ask, and a miss or a rejection with its reason
and its author is the answer (BR-072). The response is derived from the same
rows the figure is computed from, so the two cannot disagree.

---

## 8. Money — expenses

### `POST /api/expenses`

```json
{ "amount": "1240.00", "category_id": "uuid", "expense_date": "2026-08-23",
  "description": "Weekly vegetables", "split_basis": "equal",
  "paid_by_member_id": "uuid",            // optional, defaults to the caller
  "receipt_url": "https://...",           // optional
  "custom_shares": [                      // required only when split_basis = "custom"
    { "member_id": "uuid", "amount": "400.00" }
  ]
}
```

→ `201`
```json
{ "id": "uuid", "status": "approved",
  "splits": [ { "member_id": "uuid", "name": "Ravi", "share": "155.00", "guest_share": "0.00" } ],
  "period": "2026-08" }
```

Three behaviours worth stating explicitly:

- Above the approval threshold, `status` returns `pending_approval` and the splits are computed but not yet counted.
- If `expense_date` falls in a **closed** period, the response is `409 PERIOD_CLOSED` with an `options` block offering `carry_forward` or `request_reopen`.
- Guest shares are computed from the guests present on `expense_date` and added to their host's row.

### `POST /api/expenses/:id/resolve-late` — **admin**
Resolve the case above.

```json
{ "action": "carry_forward" }   // or "reopen"
```

`carry_forward` posts the expense into the current open period with `is_adjustment = true` and `adjustment_for_period` set to the original month, splitting against the membership as it stood on the original date.

### `GET /api/expenses?period=&category=&member=&page=`
Paginated list with running totals.

### `POST /api/expenses/:id/approve` · `POST /api/expenses/:id/reject`
Approval by a member other than the payer. Self-approval returns 403.

### `POST /api/expenses/:id/void` — **payer or admin**
Voids an expense in an open period and removes its splits. Logged.

### `GET /api/expenses/pending`
Everything awaiting the caller's approval.

### `POST /api/recurring` · `GET` · `PATCH /:id` · `DELETE /:id` — **admin**
Recurring definitions. The daily job posts them.

### `GET /api/categories` · `POST` · `PATCH /:id` — **admin for writes**
Includes `monthly_budget_paise` for the alerting job.

---

## 9. Periods and settlement

### `GET /api/periods/current`

```json
{
  "period": "2026-08", "status": "open",
  "total_expense": "48250.00",
  "pending_approvals": 1,
  "position": [
    { "member_id": "uuid", "name": "Ravi", "paid": "31200.00",
      "fair_share": "6031.25", "net": "25168.75" }
  ],
  "projected_penalties": [
    { "member_id": "uuid", "name": "Suresh", "deficit_points": 85, "amount": "425.00" }
  ]
}
```

### `GET /api/balances`
**New in 2.0.** Who owes whom, for everyone, netted pairwise (EX-10, EX-11).
Every member sees the whole Home's position, not only their own.

```json
{
  "me": { "paid": "4820.00", "fair_share": "3750.00", "net": "1070.00" },
  "pairwise": [
    { "from": "Vijay",   "to": "Arun", "amount": "200.00" },
    { "from": "Karthik", "to": "Ruth", "amount": "270.00" }
  ],
  "by_member": [
    { "name": "Arun", "net": "1250.00", "owed_to_them": "1250.00", "owed_by_them": "0.00" }
  ]
}
```

### `GET /api/position` — **new in 2.0**
The household financial position (IN-09, EX-13, EX-14). Where `GET /api/balances`
answers "who owes whom", this answers "where do we stand". Both derive from the
same settlement arithmetic (06-ALGORITHMS §6.5); neither reimplements the other.

```json
{
  "period": "2026-08",
  "me": { "expected": "4000.00", "paid": "4820.00", "fair_share": "3750.00",
          "variance": "1070.00", "against_expected": "820.00" },
  "members": [
    { "name": "Arun", "expected": "4000.00", "paid": "5250.00",
      "fair_share": "3750.00", "variance": "1500.00", "against_expected": "1250.00" }
  ],
  "home": { "expected": "32000.00", "paid": "30100.00", "committed": "30100.00",
            "surplus": "0.00" },
  "reserve": { "name": "House fund", "balance": "8000.00",
               "contributed": "12000.00", "drawn": "4000.00" },
  "budgets": [ { "category": "Groceries", "spent": "6420.00", "budget": "8000.00" } ]
}
```

`expected` is `null` for a member with no expected contribution set, and
`against_expected` is `null` with it. An expected contribution charges nobody
(BR-280): it changes this view and no settlement figure.

### `POST /api/expected-contributions` — **new in 2.0**
Propose setting or changing a member's expected monthly contribution (EX-13).
Creates a `set_expected_contribution` decision. There is no route that writes one
directly (BR-281).

```json
{ "member_id": "…", "amount": "4000.00", "effective_from": "2026-09-01",
  "reason": "agreed at the August house meeting" }
```
→ `201 { "decision": { "id": "…", "status": "waiting" } }`

### `POST /api/reserves` — **new in 2.0**
Propose creating a reserve (EX-14). Creates a `create_reserve` decision.

```json
{ "name": "House fund", "reason": "so the deposit for the new cylinder is not one person's problem" }
```

### `POST /api/reserves/:id/contribute` · `POST /api/reserves/:id/draw` — **new in 2.0**
A contribution is a member moving their own money into the pot and posts
directly. A **draw is a governed decision** (`reserve_draw`) and returns a
decision, not a movement (BR-287).

```json
{ "amount": "2000.00" }
{ "amount": "4000.00", "expense_id": "…", "reason": "the cylinder deposit" }
```
→ contribute: `201 { "movement": { "id": "…", "balance": "10000.00" } }`
→ draw: `201 { "decision": { "id": "…", "status": "waiting" } }`

A draw larger than the balance is refused at proposal time with
`409 RESERVE_INSUFFICIENT`, so the Home is never asked to approve a decision
that cannot apply (E-84). It is re-checked at apply time, because an earlier
draw may have emptied the pot while this one waited.

### `GET /api/reserves/:id/movements` — **new in 2.0**
The reserve's history, every row with its member or expense and its decision.

### `POST /api/adjustments` — **new in 2.0**
Propose a balance adjustment. Creates a `balance_adjustment` decision requiring
both affected members' approval, plus the Co-Admin's acknowledgement. Historical
expenses are never modified (EX-12).

```json
{ "from_member_id": "…", "to_member_id": "…", "amount": "200.00",
  "reason": "Vijay covered my share of the gas cylinder in cash" }
```
→ `201 { "id": "…", "decision": { "id": "…", "status": "waiting" } }`

### `POST /api/periods/:period/close` — **admin, changed in 2.0**

**Closing is a Critical decision** (ST-02). This route no longer closes the
period; it validates and proposes.

Refuses with 409 while approvals are pending, listing them — before proposing, so
the Home is never asked to acknowledge something that cannot happen.

```json
// 201 — the proposal, with the settlement it would produce
{
  "decision": { "id": "…", "type": "close_settlement", "status": "waiting",
                "deadline": "2026-09-05T18:30:00Z",
                "requires": { "approvals": 0, "acknowledgements": 5 } },
  "preview": {
    "period": "2026-08",
    "balances": [
      { "member_id": "uuid", "name": "Ravi", "paid": "31200.00", "fair_share": "6031.25",
        "penalty_owed": "0.00", "penalty_credit": "310.00",
        "adjustments": "0.00", "final_net": "25478.75" }
    ],
    "settlements": [
      { "from": "Suresh", "to": "Ravi", "amount": "6456.25" }
    ],
    "checks": { "nets_to_zero": true, "transfer_count": 5, "max_possible": 7 }
  }
}
```

`checks.nets_to_zero` must be `true`. A `false` value is a defect: the proposal
is refused with `500 BALANCE_NOT_ZERO` and no decision is created.

The settlement rows are written when the **decision applies**, not when it is
proposed, and are recomputed at that moment — a preview generated on Monday and
approved on Thursday settles Thursday's numbers, and the decision's `result`
records what was actually written.

### `POST /api/settlements/:id/mark-paid`
The payer asserts payment. Sets `marked_paid`.

### `POST /api/settlements/:id/confirm`
The receiver confirms. When every settlement in the period is `confirmed`, the
period moves to `closed` and locks — and any member flagged
`pending_settlement` who is now clear has their removal completed (HM-14).

### `POST /api/periods/:period/reopen` — **admin, changed in 2.0**
**A Critical decision** (ST-08), requiring a stated reason, the Co-Admin's
acknowledgement and the required member approvals. This route proposes; applying
recomputes balances, issues delta settlements, increments `reopen_count` and
writes History.

```json
{ "reason": "A ₹900 gas cylinder receipt dated 18 July surfaced on the 3rd" }
```
→ `201 { "decision": { "id": "…", "type": "reopen_settlement", "status": "waiting" } }`

### `GET /api/periods/:period`
The full historical record of a closed month: expenses, balances, penalties, settlements and their confirmation timestamps.

---

## 10. Food — **new in 2.0**

The whole of [15-FOOD-SPEC.md](15-FOOD-SPEC.md). Nothing here is required for
any other module to work, and nothing here writes money without an explicit
request.

### `POST /api/food/meals`

```json
// request
{ "name": "Paruppu Sadham",
  "food_id": "uuid",                      // optional; from the library match
  "meal_date": "2026-08-26",
  "meal_type": "dinner",
  "source": "home_cooked",
  "costs": { "base": "130.00", "prep": "30.00", "delivery": "0", "other": "20.00" },
  "items": [ { "name": "Rice" }, { "name": "Dal" }, { "name": "Ghee" }, { "name": "Pickle" } ],
  "participants": [ { "member_id": "…" }, { "member_id": "…" },
                    { "member_id": "…" }, { "guest_id": "…" } ],
  "save_to_library": true,
  "expense_id": null                      // optional link, never required
}

// 201
{ "id": "uuid", "total": "180.00", "per_person": "45.00",
  "participants": 4, "food_id": "uuid", "library_action": "created" }
```

A meal with only `name` and `meal_date` is valid. Everything else is optional,
because a food diary that demands nine fields is a food diary nobody keeps.

### `GET /api/food/meals?from=&to=&member=&source=`
Meal history, newest first, with totals and per-person amounts.

### `PATCH /api/food/meals/:id` · `DELETE /api/food/meals/:id`
The creator or a lead. Deleting a meal **never** touches a linked expense
(DR-14).

### `GET /api/food/plans?from=&to=` · `POST /api/food/plans` · `DELETE /api/food/plans/:id` — **new in 2.0**
Place a suggestion or a library meal on a future date (FD-20). A planned meal is
an intention: it creates no cost, no expense, no participants and no preference
signal, and appears in no history, Insights view or recommender input (BR-217).

```json
{ "food_id": "…", "name": "Paruppu Sadham", "planned_date": "2026-08-30" }
```

### `POST /api/food/plans/:id/confirm` — **new in 2.0**
Confirm a planned meal as eaten. This is what creates the `meals` row, at which
point every ordinary meal rule applies. Until then there is nothing to link money
to, and `POST /api/food/meals/:id/to-expense` against a plan is refused with
`409 PLANNED_MEAL_NOT_EATEN` (BR-218).

```json
{ "participants": ["…", "…"], "source": "home_cooked", "base_cost": "180.00" }
```

### `POST /api/food/meals/:id/to-expense`
Create an expense from this meal, split across its participants (FD-08).
Explicit, never automatic.

```json
{ "category_id": "uuid", "paid_by_member_id": "uuid" }
```
→ `201` with the created expense, and the meal's `expense_id` set.

### `GET /api/food/library?q=`
The Home's library. With `q`, this is the **match** call the Add Meal name field
uses (FD-10):

```json
{ "query": "parupu sadam",
  "exact": null,
  "suggestions": [
    { "food_id": "…", "name": "Paruppu Sadham", "times_eaten": 14,
      "last_eaten_on": "2026-08-12", "distance": 2 }
  ] }
```

The client offers; it never merges silently.

### `POST /api/food/library` · `PATCH /api/food/library/:id` — **member creates, lead edits**
### `POST /api/food/library/:id/merge` — **lead**
Merge two entries. Rewrites references, keeps both original names in History.

### `PUT /api/food/preferences`
Rate a food or an item. Idempotent — re-rating replaces.

```json
{ "food_id": "uuid", "rating": "like" }
// or
{ "item_name": "bitter gourd", "rating": "dislike" }
```

### `GET /api/food/preferences?food_id=`
Everyone's ratings for one food, and the Home-level score derived from them.

### `GET /api/food/restrictions` · `PUT /api/food/restrictions` · `DELETE /api/food/restrictions/:id` — **new in 2.0**

What the caller cannot eat, as distinct from what they would rather not (D-63).
`GET` returns **only the caller's own** restrictions, and those of any dependent
they are guardian to. There is no route that returns another member's
restrictions, to anyone, at any role — the recommender reads them server-side
through a security-definer function and the meal form learns about a conflict as
a conflict, never as a list (BR-226).

```json
// PUT — idempotent on (member, item). severity is required.
{ "item_name": "peanut", "severity": "allergy", "note": "carries an EpiPen" }
{ "item_name": "onion",  "severity": "diet" }
{ "item_name": "peanut", "severity": "allergy", "member_id": "uuid" }  // a dependent, by their guardian
```
→ `200 { "restriction": { "id": "…", "item_name": "peanut", "severity": "allergy" } }`

`severity` is one of `allergy`, `intolerance`, `diet`. All three remove a food
from that person's suggestions identically; they differ only in what happens when
a meal is recorded anyway — `allergy` refuses the write, the other two warn.

Errors: `VALIDATION_FAILED` on a blank item; `NOT_YOUR_RECORD` on a `member_id`
the caller is neither nor guardian to.

### `POST /api/food/meals` — restriction conflicts

Recording a meal whose items are restricted for one of its participants:

- **`allergy`** → `422 FOOD_RESTRICTION_VIOLATION`, refused by a database
  trigger, not only by the handler.

  ```json
  { "error": "FOOD_RESTRICTION_VIOLATION",
    "message": "Arun can't eat peanut. Remove them from this meal or remove the item.",
    "conflicts": [ { "member_id": "…", "display_name": "Arun", "item": "peanut oil", "restricted_item": "peanut" } ] }
  ```

  The response names the item and the member **to the person recording the
  meal**, because they need it to fix the record. It does not say why, does not
  give the severity beyond the fact of the refusal, and this is the only context
  in which one member learns about another's restriction.

- **`intolerance` or `diet`** → the meal saves. The response carries a
  `warnings` array of the same shape, which the form shows and the member
  confirms past.

### `GET /api/food/suggestions?meal_type=dinner`
The two-and-two card (FD-14).

```json
{
  "library": [
    { "food_id": "…", "name": "Paruppu Sadham", "per_person": "45.00", "score": 91,
      "reasons": ["Liked by 6 of 7", "Last eaten 14 days ago", "Low repetition this month"] },
    { "food_id": "…", "name": "Curd Kolambu", "per_person": "38.00", "score": 84,
      "reasons": ["Liked by 5 of 7", "Last eaten 21 days ago"] }
  ],
  "ai": [
    { "name": "Vegetable Kothu Parotta", "estimated_per_person": "60.00",
      "description": "…", "items": ["parotta", "vegetables", "egg"] },
    { "name": "Egg Shawarma Bowl", "estimated_per_person": "85.00",
      "description": "…", "items": ["egg", "rice", "yoghurt"] }
  ],
  "ai_available": true,
  "budget_note": "Outside-food spending is already high this month."
}
```

`library` carries at most two entries and may carry zero with
`"cold_start": true` when the Home has fewer than five recorded meals — the
honest message, never a fabricated ranking. `ai` is `[]` with
`ai_available: false` when no key is configured, the capability is off, or the
model's output failed validation. The endpoint never fails.

---

## 11. Calendar — **new in 2.0**

Read compositions over other modules. The Calendar owns no data.

### `GET /api/calendar/day?date=2026-08-26`

```json
{ "date": "2026-08-26",
  "people": { "home": 5, "away": 2,
              "away_members": [ { "name": "Vijay", "reason": "absence" } ] },
  "chores":  [ { "chore": "Kitchen", "assignee": "Arun", "status": "confirmed" } ],
  "money":   { "total": "1240.00",
               "expenses": [ { "description": "Groceries", "amount": "1240.00",
                               "status": "pending_approval" } ] },
  "food":    [ { "name": "Paruppu Sadham", "per_person": "45.00" } ],
  "pending": { "total": 1, "expenses": 1 } }
```

### `GET /api/calendar/week?week_start=2026-08-24`
Per-member points, total money, meals logged, pending approvals.

### `GET /api/calendar/month?period=2026-08`
Money, points, completion rate, meals, outside-food and home-cooking spend.

---

## 12. Insights — **supersedes Analytics in 2.0**

One screen, four types, three periods, two filters (IN-01, IN-08). The
version-1.0 `/api/analytics/*` paths remain as aliases through the transition and
are removed once the Insights screen ships.

### `GET /api/insights?type=money&period=month&from=2026-03&to=2026-08&category=&member=`

`type` is `money`, `chores`, `food` or `home`. `period` is `day`, `week` or
`month` and sets the bucket granularity, not the range.

```json
// type=money
{ "buckets": [ { "key": "2026-08", "total": "18420.00" } ],
  "by_category": [ { "name": "Food", "total": "9200.00", "change_pct": 12 } ],
  "who_paid":    [ { "name": "Arun", "total": "6200.00" } ],
  "paid_vs_share": [ { "name": "Arun", "paid": "6200.00", "fair_share": "3750.00",
                       "net": "2450.00" } ],
  "owed": [ { "from": "Vijay", "to": "Arun", "amount": "200.00" } ] }
```

```json
// type=food
{ "home_vs_outside": { "home_cooked": "3100.00", "outside": "4800.00" },
  "spend_over_time": [ { "key": "2026-08", "total": "7900.00" } ],
  "most_liked":  [ { "name": "Paruppu Sadham", "score": 0.71, "times_eaten": 14 } ],
  "recent":      [ { "name": "KFC Combo", "meal_date": "2026-08-26" } ],
  "most_repeated": [ { "name": "Curd Rice", "times_30d": 9 } ] }
```

```json
// type=home
{ "activity": { "expenses": 42, "meals": 23, "chores_confirmed": 61 },
  "pending_decisions": 4,
  "workload_imbalance": { "top3_share": 0.42, "max_deviation_points": 18 } }
```

### `GET /api/insights/budgets?period=2026-08`
Per category: budget, spent, remaining, projected month end, breach flag.

### `GET /api/insights/export?type=&period=&months=`
CSV, as a download: `text/csv; charset=utf-8` with a `content-disposition`
filename and a UTF-8 byte-order mark so a spreadsheet reads names and amounts
correctly.

`type` is one of `expenses`, `money`, `members`, `chores`, `food` or `budgets`.
Amounts are plain rupee decimals, and any field that would otherwise be read as a
spreadsheet formula is escaped.

### `GET /api/insights/export/full` — **new in 2.0**
The Home's complete history in one download: expenses, splits, settlements,
assignments, confirmations, points, meals, decisions, responses and rules
(IN-10). A zip of CSVs, one per record type.

### `GET /api/settlements/:period/statement.pdf` — **new in 2.0**
The period's settlement statement as PDF (IN-10).

**These three routes carry a standing guarantee (NFR-19, BR-292).** They are
available to every Active member, for their own records and the Home's, with no
tier, no cap and no waiting period. Adding a feature gate, a quota or a payment
check to any export path is a breaking change requiring the same review as
removing a requirement — the complaint recorded against Tricount is the removal
of exactly this.

---

## 13. Notifications

### `GET /api/notifications/push`
The VAPID public key and every device registered to the caller.

```json
{
  "vapid_public_key": "BJ...",
  "configured": true,
  "devices": [
    { "id": "…", "platform": "web", "label": "Chrome on Android", "last_seen_at": "…" }
  ]
}
```

### `POST /api/notifications/push`
Register a device. `platform` is optional and defaults to `web`; the native app sends its own.

```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": { "p256dh": "...", "auth": "..." },
  "platform": "android"
}
```

### `DELETE /api/notifications/push`
Unregister a device by endpoint — any of the caller's own, not only the one making the request. A member removing a laptop they left elsewhere cannot make the request from it.

### `GET /api/notifications?unread=true` · `POST /api/notifications/read`

The POST body is `{ "id": "uuid" }` to mark one notification, or `{}` to mark
the caller's whole feed read. There is no `/:id/read` route in the current
implementation.

### `GET /api/notifications/prefs` · `PUT /api/notifications/prefs`

---

## 14. AI endpoints

All of them degrade cleanly when no key is configured. "Configured" means a key stored against this house, or the environment fallback — see [10-LLM-SPEC.md](10-LLM-SPEC.md) section 3.5.

### `GET /api/ai/credentials`
What this house has set. Reads the `house_llm_config` view, so it can never return a key.

```json
{ "configured": true, "provider": "groq", "model": "llama-3.3-70b-versatile",
  "key_last4": "4f2a", "status": "active",
  "last_verified_at": "2026-08-25T09:12:00Z", "last_error": null }
```

`{ "configured": false }` when the house has set nothing. Members may read it; only admins may change it.

### `GET /api/ai/providers`
The provider registry, as the picker renders it: id, label, models, default model, free-tier note and console URL. Static, no auth beyond a session, and it contains no secrets.

### `POST /api/ai/credentials/verify`
**Admin.** Sends a fixed nine-token prompt through the supplied provider and reports the round trip. **Stores nothing.**

```json
// request
{ "provider": "groq", "model": "llama-3.3-70b-versatile", "api_key": "gsk_…" }

// 200
{ "ok": true, "latency_ms": 412, "model_echo": "llama-3.3-70b-versatile" }

// 200, on a rejected key
{ "ok": false, "error": "PROVIDER_REJECTED_KEY" }
```

A provider that refuses the key is a `200` with `ok: false`, not a `4xx` — it is a fact about the key, not a fault in the request.

### `PUT /api/ai/credentials`
**Admin.** Stores provider, model and key, sealed. Calls `set_house_llm_credential`. The response is the same shape as `GET`, and never contains the key.

Returns `409 LLM_SEALING_UNAVAILABLE` when `LLM_KEY_ENCRYPTION_KEY` is unset on the server. It never stores a key in plaintext.

### `DELETE /api/ai/credentials`
**Admin.** Removes the row. The house returns to the deterministic paths, and nothing else changes.

### `GET /api/ai/capabilities` · `PUT /api/ai/capabilities` — **new in 2.0**
Which AI features this Home has switched on (AI-02). Read by any member, written
by an Admin.

```json
{ "food_suggestions": true, "meal_ideas": true, "weekly_summary": true,
  "natural_language": true, "rule_parsing": true, "schedule_proposals": false }
```

A capability that is off behaves exactly as if no key were configured, for that
feature alone.

### `POST /api/ai/parse` — **extended in 2.0**
Natural-language entry. **Always returns a proposal for the user to confirm — it
never writes.**

```json
// request
{ "text": "paid 840 for vegetables yesterday" }

// 200
{ "intent": "expense",
  "confidence": 0.94,
  "proposal": { "amount": "840.00", "category": "Groceries",
                "expense_date": "2026-08-22", "description": "Vegetables" },
  "requires_confirmation": true }
```

Four intents in version 2.0 (AI-06):

| Input | Intent | Proposal |
|-------|--------|----------|
| "paid 840 for vegetables yesterday" | `expense` | amount, category, date, description |
| "I mopped the hall" | `chore_done` | the matching assignment |
| "I'll be away Friday" | `absence` | from_date, to_date, affected chores |
| "I made paruppu sadham today" | `meal` | name with its library match, source, date |

Anything else is `intent: "unknown"` with a clarification string and no blame.

Without a key, or with `natural_language` off: `501 AI_DISABLED`, and the client
falls back to the manual form — which is the ordinary path, not an error state.

### `POST /api/ai/food-ideas` — **new in 2.0**
Two new meal ideas from the Home's structured context (FD-16). Called by
`GET /api/food/suggestions`; exposed separately for the Food screen's refresh
control.

Validation before anything is returned: exactly two, no library duplicate, no
disliked item, plausible cost, and **no named restaurant, brand or claim of
availability** (FD-19). A failure returns `{ "ideas": [] }`, not an error.

### `POST /api/rules/parse` — **new in 2.0**
Documented in section 4. Listed here because it is the sixth AI call site.

### `GET /api/ai/digest?week_start=`
The weekly fairness summary.

```json
{ "generated": true, "model": "gemini-2.0-flash",
  "summary": "Ravi and Kumar together earned 61 percent of the week's points...",
  "highlights": { "carried": ["Ravi", "Kumar"], "coasted": ["Suresh"], "improved": ["Vinoth"] },
  "next_week_correction": "Suresh's target rises by 30 points; two evening kitchen slots moved to him because he is home by 18:30." }
```

Without a key: `generated: false` with a deterministic numeric summary instead. The endpoint never fails.

---

## 15. Rate limits

| Endpoint group | Limit |
|----------------|-------|
| `POST /api/expenses` | 30 per member per hour |
| `POST /api/chores/*/confirm` and `/reject` | 60 per member per hour |
| `POST /api/food/meals` | 30 per member per day |
| `POST /api/decisions` | 20 per member per day |
| `POST /api/decisions/*/respond` | 100 per member per hour |
| `POST /api/approvals/approve-all` | 20 per member per hour |
| `POST /api/join/*/request` | 5 per user per hour, and 10 per Home per hour |
| `POST /api/ai/parse` | 20 per member per day |
| `POST /api/rules/parse` | 20 per Home per day |
| `POST /api/ai/food-ideas` | 10 per Home per day |
| `POST /api/ai/credentials/verify` | 10 per Home per hour |
| `POST /api/chores/generate` | 5 per Home per day |
| Everything else | 300 per member per hour |

The join-request limit is per user **and** per Home, because the second is what
stops an open invite link from being used to flood a Home's request queue.

**These are abuse ceilings, not product tiers (NFR-18, BR-290, CM-1).** Every
limit above is sized so that a real member doing ordinary household recording
never reaches it: thirty expenses an hour and thirty meals a day are far above
any household's real rate. A member who hits one of these during ordinary use has
found a defect in the sizing, to be raised and corrected — not a boundary to be
sold past. There is no daily cap on recording, no waiting period between entries,
and no paid tier anywhere in the product. The export routes and
`GET /api/position` are deliberately absent from this table.

The three AI limits are different in kind: they bound a Home's consumption of its
own third-party quota, and a Home with no key configured is not limited by them
because it makes no such calls.

---

## 16. Endpoint summary

"Lead" means Admin or Co-Admin. Rows marked **2.0** are new or changed in this
version.

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/api/houses` | any | Create a Home **2.0** |
| GET | `/api/houses/current` | member | Home context |
| PATCH | `/api/houses/current/settings` | admin | Home settings |
| GET | `/api/homes` | any | My Homes **2.0** |
| POST | `/api/homes/select` | member | Switch Home **2.0** |
| GET/POST/DELETE | `/api/invitations` | lead | Invite link **2.0** |
| GET | `/api/join/:token` | public | What this link is **2.0** |
| POST | `/api/join/:token/request` | any | Request to join **2.0** |
| GET | `/api/join-requests` | lead | Open requests **2.0** |
| POST | `/api/join-requests/:id/accept` | lead | Accept **2.0** |
| POST | `/api/join-requests/:id/decline` | lead | Decline **2.0** |
| POST | `/api/decisions` | member | Propose a decision **2.0** |
| GET | `/api/decisions` | member | List decisions **2.0** |
| GET | `/api/decisions/:id` | member | One decision in full **2.0** |
| POST | `/api/decisions/:id/respond` | participant | Approve, reject, acknowledge **2.0** |
| POST | `/api/decisions/:id/cancel` | proposer | Withdraw **2.0** |
| GET | `/api/approvals` | member | Everything waiting on me **2.0** |
| POST | `/api/approvals/approve-all` | member | Batch, permission-scoped **2.0** |
| GET/PUT | `/api/governance/policy` | member / decision | The policy **2.0** |
| GET | `/api/rules` | member | The Home's rules **2.0** |
| POST | `/api/rules/parse` | admin | Text to proposal, stores nothing **2.0** |
| POST/PATCH | `/api/rules`, `/api/rules/:id` | admin | Propose a rule or an edit **2.0** |
| POST | `/api/rules/:id/disable` | admin | Disable, via decision **2.0** |
| GET | `/api/rules/:id/history` | member | Every version **2.0** |
| POST | `/api/absences/preview` | member | What it would cost **2.0** |
| POST | `/api/absences` | member | Request an absence **2.0** |
| GET | `/api/absences` | member | List **2.0** |
| POST | `/api/absences/:id/cancel` | requester | Withdraw **2.0** |
| GET | `/api/members` | member | Member list with standing |
| PATCH | `/api/members/:id` | admin / lead | Role, residency, flags **2.0** |
| POST | `/api/members/dependents` | lead | Create a dependent **2.0** |
| DELETE | `/api/profile` | self | Erase the caller's account **2.0** |
| POST/PATCH/DELETE | `/api/rooms` | admin | Room management |
| POST | `/api/rooms/:id/assign` | admin | Move a member |
| GET/PUT | `/api/availability` | member | Weekly availability |
| POST/DELETE | `/api/availability/exceptions` | member | Date exceptions |
| GET/POST/DELETE | `/api/guests` | member | Guest registration |
| GET/POST/PATCH/DELETE | `/api/chores/templates` | admin writes | Chore definitions |
| GET | `/api/chores/week` | member | House week view |
| GET | `/api/chores/mine` | member | My assignments |
| POST | `/api/chores/generate` | admin | Force generation |
| POST | `/api/chores/:id/done` | assignee | Mark done |
| POST | `/api/chores/:id/confirm` | non-assignee | Confirm, against the quorum **2.0** |
| POST | `/api/chores/:id/reject` | non-assignee | Reject |
| POST | `/api/chores/:id/swap` | assignee | Request swap |
| POST | `/api/swaps/:id/respond` | target | Accept or decline |
| POST | `/api/chores/:id/release` | assignee | To open pool |
| POST | `/api/chores/:id/claim` | member | Claim from pool |
| GET | `/api/effort/leaderboard` | member | Standings |
| GET | `/api/effort/me` | member | My effort history |
| GET | `/api/effort/penalties` | member | Projected penalties |
| POST/GET | `/api/expenses` | member | Log and list |
| POST | `/api/expenses/:id/resolve-late` | admin | Carry forward or reopen |
| POST | `/api/expenses/:id/approve` | non-payer | Approve |
| POST | `/api/expenses/:id/void` | payer or admin | Void |
| GET/POST/PATCH | `/api/recurring` | admin | Recurring expenses |
| GET | `/api/periods/current` | member | Live position |
| GET | `/api/balances` | member | Who owes whom, for everyone **2.0** |
| POST | `/api/adjustments` | member | Propose a balance adjustment **2.0** |
| POST | `/api/periods/:period/close` | admin | Propose the close **2.0** |
| POST | `/api/settlements/:id/mark-paid` | payer | Assert payment |
| POST | `/api/settlements/:id/confirm` | receiver | Confirm receipt |
| POST | `/api/periods/:period/reopen` | admin | Propose a reopen **2.0** |
| POST | `/api/food/meals` | member | Record a meal **2.0** |
| GET | `/api/food/meals` | member | Meal history **2.0** |
| PATCH/DELETE | `/api/food/meals/:id` | creator or lead | Edit, delete **2.0** |
| POST | `/api/food/meals/:id/to-expense` | member | Make an expense from it **2.0** |
| GET | `/api/food/library` | member | Library, and the name match **2.0** |
| POST/PATCH | `/api/food/library` | member / lead | Create, edit **2.0** |
| POST | `/api/food/library/:id/merge` | lead | Merge duplicates **2.0** |
| PUT/GET | `/api/food/preferences` | member | Rate, and read ratings **2.0** |
| GET/PUT/DELETE | `/api/food/restrictions` | self | What the caller cannot eat **2.0** |
| GET | `/api/food/suggestions` | member | Two and two **2.0** |
| GET/POST/DELETE | `/api/food/plans` | member | Planned meals — intentions, not records **2.0** |
| POST | `/api/food/plans/:id/confirm` | member | Confirm a plan as eaten **2.0** |
| GET | `/api/calendar/day\|week\|month` | member | The combined view **2.0** |
| GET | `/api/insights` | member | One screen, filtered **2.0** |
| GET | `/api/insights/budgets` | member | Budget status **2.0** |
| GET | `/api/insights/export` | member | CSV **2.0** |
| GET | `/api/insights/export/full` | member | Full-history export, permanent **2.0** |
| GET | `/api/settlements/:period/statement.pdf` | member | Settlement statement PDF **2.0** |
| GET | `/api/position` | member | The household financial position **2.0** |
| POST | `/api/expected-contributions` | member | Propose an expected contribution **2.0** |
| POST | `/api/reserves` | member | Propose a reserve **2.0** |
| POST | `/api/reserves/:id/contribute` | member | Put money in the pot **2.0** |
| POST | `/api/reserves/:id/draw` | member | Propose a draw — governed **2.0** |
| GET | `/api/reserves/:id/movements` | member | The pot's history **2.0** |
| POST | `/api/chores/:id/share` | lead | Share an instance between assignees **2.0** |
| GET | `/api/effort/explain` | member | The arithmetic behind a points figure **2.0** |
| POST | `/api/notifications/push` | member | Register a device for Web Push |
| DELETE | `/api/notifications/push` | member | Remove a device |
| POST | `/api/ai/parse` | member | Natural-language proposal, four intents **2.0** |
| GET/PUT | `/api/ai/capabilities` | member / admin | Per-feature switches **2.0** |
| POST | `/api/ai/food-ideas` | member | Two new meal ideas **2.0** |
| GET | `/api/ai/digest` | member | Weekly fairness summary |
| GET | `/api/ai/providers` | member | The provider registry the picker renders |
| GET | `/api/ai/credentials` | member | What this house has set, key excluded |
| POST | `/api/ai/credentials/verify` | admin | Test a key without storing it |
| PUT | `/api/ai/credentials` | admin | Store provider, model and key, sealed |
| DELETE | `/api/ai/credentials` | admin | Remove the key |
