# Parallel build plan — Track A (Claude) and Track B (OpenCode)

**Created:** 2026-08-28 · **Owner of this file:** shared, with per-track sections.

This file exists so that work survives a lost session. It is the coordination
record for two agents building HouseOS in the same working tree at the same
time. `PROGRESS.md` remains the authority on what is *built*; this file is the
authority on *who is building what, right now, and how far they got*.

**If you are an agent picking this up cold:** read [How to resume](#how-to-resume)
first, then your own track's section. Do not re-derive the state snapshot — it is
recorded below with the commands that produced it.

---

## How to resume

1. Identify which track you are. Track A is Claude, Track B is OpenCode. If you
   were not told, ask before touching anything — the tracks own disjoint files
   and guessing wrong causes a merge conflict in someone else's work.
2. Read [Ownership](#ownership) and [Shared-database protocol](#shared-database-protocol).
3. Re-verify the state snapshot, which takes about a minute:

   ```bash
   git log --oneline -10
   git status --short
   ls supabase/migrations | tail -10
   docker ps --format "{{.Names}}\t{{.Status}}"
   npx vitest run
   ```

4. Find the first unchecked box in your track. That is your task.
5. Tick boxes **as you finish each one**, and add a dated line to the
   [Handoff log](#handoff-log). A ticked box with no commit behind it is a lie
   that costs the next session an hour.

---

## State snapshot — 2026-08-28

Verified by running the commands above. Update this block only when it stops
being true, and say who updated it.

| Fact | Value |
|---|---|
| Local Supabase | running — DB `127.0.0.1:54952`, API `55321`, Studio `55323`, Mailpit `55324` |
| Migrations present | through `20260828090070_llm_capability_switches.sql` |
| Migrations applied | all of the above, to the **local** stack only. Nothing pushed to hosted. |
| Test suite | `npx vitest run` → **27 failed / 570 passed / 17 skipped**, 8 failed files |
| Uncommitted | absence slice (057), shared-assignment slice (058), `tests/setup.ts`, `vitest.config.mts`, `supabase/config.toml` |
| Phase 12 (Rules) | **built and committed** (`45f7266`, `3b2e108`, migrations 065–070). `PROGRESS.md` wrongly says "not started". |
| `lib/types/schema-pending.ts` | reduced to a 47-line shim |

### Two facts that bite if forgotten

1. **`npm run gen:types` passes `--linked`.** It reads the *hosted* project
   `foxzpnofcpyeouwnoqjp`, not the local stack. Running it today overwrites
   `lib/types/supabase.ts` from the wrong database. Track B fixes this in B1;
   nobody runs the script until then.
2. **`enqueue_notification` is callable from an authenticated browser client.**
   The test that catches it is currently failing. This is a real privilege gap,
   not a local-only artifact — see B2.

### `apply_decision_effect` is a registry, not a `case`

Since migration 066 the dispatcher looks up `effect_<decision_type>(decisions, jsonb)`
or `effect_<decision_type>(decisions)` and raises `EFFECT_NOT_IMPLEMENTED` if
neither exists. **New decision effects are pure additions. Never edit the dispatcher.**

- Effects that exist: `absence_request`, `change_confirmation_policy`,
  `change_governance`, `change_home_mode`, `change_rule`, `join_request`,
  `remove_member`.
- Enum values with no effect yet: `close_settlement`, `reopen_settlement`,
  `balance_adjustment`, `set_expected_contribution`, `create_reserve`, `reserve_draw`.

### The 27 failures, root-caused

| Cluster | Count | Cause | Owner |
|---|---|---|---|
| Auto-confirm regression from 058 | 19 | `mark_chore_done` returns `confirmed` not `done_pending`; `quorumFor(…,'off')` gives `autoConfirm: false`; a `23514` check violation on confirm; `WRONG_STATE` masking `SELF_CONFIRM` / `ALREADY_CONFIRMED` / `NOT_ELIGIBLE_CONFIRMER` | A |
| Routine privileges | 5 | `permission denied for function check_budget_thresholds` (4), and inversely the enqueue path being reachable from a browser (1) | B |
| Stale test | 1 | `column "telegram_enabled" does not exist` — dropped in 044 under D-34 | B |
| Fixture | 1 | governance-notifications `beforeAll` raises `ADMIN_REQUIRED` | A |
| Removal netting | 1 | `pending_settlement` stays `true` after the last payment is confirmed | A |

Two of the notifications failures — "writes N-06 to everybody except the person
who did the work" and "tells the assignee when their chore is confirmed" — are
**caused by the 058 regression** and clear themselves when A1 lands. Track B
must not edit them.

---

## Ownership

Disjoint by construction. If a fix seems to need a file you do not own, stop and
write it into the [Handoff log](#handoff-log) rather than editing the file.

| | Track A — Claude | Track B — OpenCode |
|---|---|---|
| **Migration numbers** | `20260828090071`–`…079`, plus the uncommitted `…057` and `…058` | `20260828090080`–`…099` |
| `lib/domain/` | `governance/`, `settlement/`, `scheduling/`, `fairness/`, `absence.ts` | `food/` (new), `notifications/`, `analytics/` |
| `lib/data/` | `chores.ts`, `governance.ts`, `mutations.ts`, `settlement.ts`, `absence.ts`, `expenses.ts`, `expense-service.ts` | `food.ts` (new), `notifications.ts`, `analytics.ts` |
| `lib/validation/` | `absence.ts`, new governed-money schemas | `food.ts` (new) |
| `app/api/` | `decisions/`, `periods/`, `settlements/`, `chores/`, `absences/` | `food/` (new), `notifications/`, `analytics/` |
| `app/(app)/` | governance and chore screens | `food/` (new) |
| `components/` | `governance/`, `chores/`, `settle/`, `house/absence-request.tsx` | `food/` (new), `notifications/`, `analytics/` |
| **Tests** | `chore-lifecycle`, `chore-quorum`, `governance`, `governance-notifications`, `household`, `membership`, `close-period`, `unit/governance*`, `unit/netting`, `unit/scheduling` | `budget-alerts`, `notifications`, `rls-isolation`, `llm-credentials`, new `food*`, **all** `tests/e2e/**`, `playwright.config.ts` |
| **Config** | `vitest.config.mts`, `tests/setup.ts`, `supabase/config.toml` | `package.json` (the `gen:types` script only) |
| **Docs** | none | `PROGRESS.md`, `AGENTS.md`, `DECISIONS.md`, `docs/**`, `README.md` |

This file, `PARALLEL-PLAN.md`, is the one shared file. Edit only your own track's
checkboxes and your own handoff-log lines.

---

## Shared-database protocol

One local database, two agents. Before any `supabase db reset`,
`supabase migration up`, or `supabase db push`:

```bash
while ! mkdir .db.lock 2>/dev/null; do sleep 5; done
# run the migration command, then immediately:
rmdir .db.lock
```

- Never hold the lock while running a test suite.
- Announce a `db reset` in the handoff log **before** running it — it rebuilds
  the other track's schema too.
- If `.db.lock` has been held for more than ten minutes, note it in the log
  before removing it.
- **Nobody runs `npm run db:push`.** The hosted project is written to only when
  the user explicitly asks for it.

---

## Track A — Claude: the governance spine and governed money

Read before starting: `AGENTS.md`, `DECISIONS.md` (D-40 to D-43, D-59, D-60),
`docs/14-GOVERNANCE-SPEC.md`, Phase 11 in `docs/07-ROADMAP.md`.

### A1 — Fix the auto-confirm regression from migration 058

- [ ] Root-cause and fix
- [ ] `supabase db reset` and the four affected suites pass
- [ ] Commit 1: the 058 correction plus `vitest.config.mts`, `tests/setup.ts`, `supabase/config.toml`
- [ ] Commit 2: the 057 absence slice
- [ ] Commit 3: the 058 shared-assignment slice

Nineteen of the 27 failures. Do this before anything else. The shape of it:
`mark_chore_done` auto-confirms immediately, so every later assertion about the
confirmation path hits an already-`confirmed` row and receives `WRONG_STATE`
instead of the specific refusal the test names.

Quoted failures:

```
chore-lifecycle.test.ts   expected 'confirmed' to be 'done_pending'
chore-lifecycle.test.ts   expected 'WRONG_STATE' to contain 'SELF_CONFIRM'
chore-quorum.test.ts      expected { code: '23514', ... } to be null
chore-quorum.test.ts      expected 3 to be 2
chore-quorum.test.ts      expected undefined to match object { required: 1, ... }
household.test.ts         expected 'confirmed' to be 'done_pending'
unit/governance.test.ts   quorumFor(four, "kumar", "off") gave autoConfirm: false, expected true
```

Two suspects, read both:

1. `chore_quorum_for` in `…090058_shared_assignment_and_confirmation_policy.sql`.
   058 changed it to exclude *all* assignees from the pool. Check whether the
   required count can fall to zero in a small Home and trip auto-confirm. One
   test got SQL `undefined` back, which also suggests a signature or overload
   problem.
2. `quorumFor` in `lib/domain/governance/quorum.ts`. The `off` policy must give
   `autoConfirm: true`, and the pure function must agree with the SQL one — there
   is a test named "reads the same counts the pure function does" asserting exactly that.

Also chase the `23514` check-constraint violation on confirm: a constraint added
by 058 is rejecting a legitimate row.

057 and 058 are **uncommitted**, so fix them in place rather than adding a fix-up
migration, then:

```bash
while ! mkdir .db.lock 2>/dev/null; do sleep 5; done
npx supabase db reset
rmdir .db.lock
npx vitest run tests/integration/chore-quorum.test.ts tests/integration/chore-lifecycle.test.ts tests/integration/household.test.ts tests/unit/governance.test.ts
```

Acceptance to preserve (Phase 11, `docs/07-ROADMAP.md`):

- A four-person Home's chore requires an Admin or Co-Admin plus one other; three
  ordinary members confirming it does not confirm it.
- The quorum snapshotted at "done" does not move when somebody joins mid-window.
- A 25-point chore shared by three members divides 8 / 8 / 9, summing to 25 with
  no rounding loss.
- Neither shared assignee can confirm their shared chore; in a two-person Home
  where both are assignees it auto-confirms at the window instead of blocking.

### A2 — Two governance bugs

- [ ] `governance-notifications.test.ts` fails wholesale with `Unknown Error: ADMIN_REQUIRED`
      raised in `beforeAll`. Determine whether the fixture fails to establish an
      Admin or whether a role check regressed. Do not "fix" it by weakening the check.
- [ ] `membership.test.ts` → "leaves a removal pending while money is outstanding,
      and finishes it when the last payment is confirmed" returns
      `pending_settlement: true` where `false` is expected. The completion path
      after the final settlement confirmation is not firing — migration 056 /
      `complete-pending-removals` territory.
- [ ] Commit

### A3 — Phase 11 slice 5: governed close and reopen, with `balance_adjustments`

Migration `20260828090071_governed_close_and_adjustments.sql`.

- [ ] `balance_adjustments` table — house-scoped, RLS policy, isolation test,
      integer paise, referencing the decision that created it
- [ ] `effect_close_settlement(decisions, jsonb)`, `effect_reopen_settlement(decisions, jsonb)`,
      `effect_balance_adjustment(decisions, jsonb)` — all two-argument, because the
      close needs apply-time numbers through `p_input`. The roadmap is explicit:
      settlement rows are written **at apply time from apply-time numbers**,
      computed by `lib/domain/settlement/netting.ts`, not at proposal time.
- [ ] `revoke execute … from public, anon, authenticated` on every new `effect_*`,
      the way every existing effect does it
- [ ] `POST /api/periods/[period]/close` and `/reopen` move behind a decision
      (D-59). Keep the handler's validation and authorisation; what changes is
      that it proposes rather than acts.
- [ ] Tests: closing August requires the Co-Admin's acknowledgement and three
      members'; `Σ final_net = 0` still holds with adjustments in the close
      (property-test with `fast-check`, as `tests/unit/netting.test.ts` already
      does for the un-adjusted case); `apply_decision` refuses a decision that is
      not `approved`, and one missing a mandatory response, **when called with
      the service-role key**
- [ ] Commit

### A4 — Phase 11 slice 6: expected contributions and the reserve

Migration `20260828090072_expected_contributions_and_reserve.sql`. Last, because
it is the only remaining slice that changes settlement arithmetic.

- [ ] `member_expected_contributions`, `reserves`, `reserve_movements` — each with
      RLS and an isolation test
- [ ] `effect_set_expected_contribution`, `effect_create_reserve`,
      `effect_reserve_draw`, all with execute revoked from `public`, `anon`,
      `authenticated`
- [ ] The draw's effect on an expense's split, in `lib/domain/expenses/split.ts`
      and its data layer
- [ ] A draw larger than the reserve balance is refused **at proposal time**, so
      the Home is never asked to approve a decision that cannot apply. In
      `lib/domain/governance/preview.ts` **and** in the database, not only in the
      route handler.
- [ ] Tests: a funded reserve changes nobody's settlement position until a draw is
      applied; `Σ variance(m) + reserve_balance = 0` for the period, property-tested;
      an expected contribution set for a member charges them nothing — it changes
      the position view and no settlement figure
- [ ] Commit

---

## Track B — OpenCode: privileges, hygiene, coverage, and Food

Read before starting: `AGENTS.md`, `DECISIONS.md`, then `docs/15-FOOD-SPEC.md`
and Phase 13 in `docs/07-ROADMAP.md` before B6.

### B1 — Repair `npm run gen:types` before anyone runs it

- [ ] Change `--linked` to read the local stack (`--local`, or `--db-url` against
      `postgresql://postgres:postgres@127.0.0.1:54952/postgres`)
- [ ] Keep a deliberate hosted-schema dump as a separate script, named so nobody
      runs it by accident
- [ ] Regenerate — **after A1 lands**, since the schema is about to change —
      and verify the types match the applied migrations
- [ ] Commit: `fix(types): generate against the stack the tests run on`

### B2 — The privilege gap, which is partly a security hole

Five failures, pointing in two opposite directions.

*Should be callable and is not* — four tests in `budget-alerts.test.ts`:

```
Unknown Error: permission denied for function check_budget_thresholds
```

*Must not be callable from a browser and is* — `notifications.test.ts` →
"keeps the enqueue path out of a browser's hands" expects an error and receives
`null`.

One cause, documented at the top of `…090068_public_table_grants.sql`: a database
built with `supabase migration up` against a running stack never receives the
platform's default privileges, while one built with `supabase db reset` receives
them for **every** routine in `public`. Migration 068 fixed this for tables and
deliberately said nothing about routines. These two failures are the two halves
of that.

- [ ] Write `20260828090080_routine_grants.sql`, in the same spirit and with the
      same kind of commentary as 068:
      - `revoke execute on all routines in schema public from public, anon, authenticated`
        as the baseline, then grant back **by name** only what a browser client is
        meant to call
      - re-assert the load-bearing revocations 068 lists: `apply_decision` to
        `service_role` alone; `apply_decision_effect` and every `effect_*` to
        nobody; the migration-037 service functions revoked from `public`
      - `alter default privileges` so the next function added does not silently
        reopen the hole
      - build the grant list from what the app actually calls — grep `.rpc(`
        across `lib/` and `app/`. Anything not on that list stays revoked.
- [ ] Extend `rls-isolation.test.ts` (or add a sibling) asserting the privilege
      posture directly: an authenticated client cannot execute `apply_decision`,
      `apply_decision_effect`, any `effect_*`, or the enqueue path — and *can*
      execute the ones the app depends on. **This test is what stops it recurring.**
- [ ] Commit: `fix(db): state routine privileges instead of inheriting them`

### B3 — One stale test

- [ ] `notifications.test.ts` → "refuses to switch settlement off, however the
      request is phrased" fails with `column "telegram_enabled" does not exist`.
      Telegram went in migration 044 under D-34. Update the call to the current
      `set_notification_prefs` signature while keeping what the test asserts —
      that settlement notifications cannot be switched off, however the request is
      phrased. Remove the dead column, not the assertion.
- [ ] Commit (may ride with B2)

Leave "writes N-06 to everybody except the person who did the work" and "tells the
assignee when their chore is confirmed" alone. They are A1's.

### B4 — Documentation, brought back into line with the code

- [ ] `PROGRESS.md`: Phase 12 is built and committed (migrations 065–070 applied
      locally). Migrations 045–070 are applied to the **local** stack; state
      plainly that none have reached hosted. Replace the stale "Result on
      2026-08-26" verification row with a dated run you actually performed —
      typecheck, lint, `npx vitest run`, build — including the failure count and
      which failures are work in progress. Note that `schema-pending.ts` is now a
      47-line shim. Record Phase 11's remaining slices as in progress, not done.
- [ ] `AGENTS.md`: the "Current delivery focus" block still says phase 11 runs
      "against unpushed migrations (047–056)" and still calls standing up local
      Supabase "the next piece of work". Both are done.
- [ ] `DECISIONS.md`: add an entry for the routine-privilege posture from B2. It
      is exactly the kind of non-obvious call that file exists for.
- [ ] Commit: `docs: the state the build is actually in`

### B5 — The end-to-end journeys the phases owe

`AGENTS.md` records that from phase 11 onward each phase adds one Playwright
journey through its main path, because the route handlers and screens have no
other automated coverage. Two are missing.

- [ ] **Phase 10 — membership.** Create a Home, generate an invite link, a second
      person requests to join through `/join/[token]`, an Admin accepts, the new
      member appears in the members list, and the Home switcher shows two Homes
      for the account belonging to two.
- [ ] **Phase 11 — governance.** Propose a decision from the screen that raises
      it, respond as the required participants, watch it reach `approved`, apply
      it, see the effect on the Approvals surface. Use decision types that already
      have effects (`change_governance`, `change_home_mode`, `join_request`) so it
      does not depend on A3/A4.
- [ ] Commit: `test(e2e): the membership and governance journeys`

Follow the shape of `tests/e2e/rules.spec.ts`, including its header note about
needing the app running.

### B6 — Phase 13: Food

Read `docs/15-FOOD-SPEC.md` in full first. One conventional commit per slice, in
this order. Food adds no decision types, so you will never need the governance
enum or the dispatcher — if you find yourself wanting them, stop and write to the
handoff log.

- [ ] **1. Schema.** `foods`, `meals`, `meal_items`, `meal_participants`,
      `food_preferences`, each with an RLS policy and an isolation test.
      Migration `20260828090081_food.sql`. Integer paise. Dates evaluated in the
      house timezone, timestamps persisted in UTC.
- [ ] **2. Per-person cost.** Exact remainder distribution and its deferred
      trigger. ₹180 across three is ₹60 each exactly; a total that does not divide
      still sums back to the total. Property-test with `fast-check`.
- [ ] **3. Add Meal flow**, in the order of section 8.1 of the food spec: name,
      participants, source, cost, then everything optional. A meal with only a
      name and a date must save.
- [ ] **4. Library matching** and the did-you-mean panel; merge for leads. Four
      spellings of one dish offer a match rather than creating four entries, and
      nothing merges without a person confirming.
- [ ] **5. Preferences and ratings.** Ratings, Home preference, person preference,
      item-level override. A member who dislikes an ingredient is never shown a
      meal containing it, while the Home's own ranking of that meal is unchanged.
- [ ] **6. The deterministic recommender**, its reasons, its cold-start message.
      The same data always produces the same two suggestions in the same order.
      With four recorded meals the library half says so and shows recent meals
      rather than a score.
- [ ] **7. AI food ideas** as the fifth call site, behind the AI Router with the
      per-Home capability switch — read `docs/10-LLM-SPEC.md` (v3.0) first.
      Credentials are house-owned and encrypted; there is no deployment-wide
      environment key. With AI returning a library duplicate, a disliked item, a
      named restaurant, or one idea instead of two, the AI half disappears and the
      library half still renders, with no error anywhere.
- [ ] **8. Expense links**, optional, both directions, no cascade. Voiding an
      expense linked to a meal leaves the meal intact; deleting a meal leaves the
      expense intact. **Adding an expense must never open a food form.**
- [ ] **9. Planned meals (FD-20).** A planned meal creates no cost, no expense, no
      participants and no preference signal, and appears in no food history,
      Insights view or recommender input until a member confirms it was eaten.
- [ ] **10. One Playwright journey** through the main path.

Notifications N-45 and N-46 belong to Food and arrive with this phase.

---

## Standing rules, both tracks

- Money is integer paise everywhere; rupees exist only at the UI boundary.
- Every new house-scoped table gets a Postgres RLS policy **and** an isolation test.
- Critical invariants go in the database as well as the application — a
  service-role key bypasses RLS but not constraints and triggers.
- Dates are evaluated in the house timezone; timestamps persist in UTC.
- Keep business logic out of `app/`; handlers validate, authorise, delegate, respond.
- Never read, print or commit values from `.env.local`. The service-role key,
  VAPID private key and LLM keys stay server-side.
- Do not hand-edit `lib/types/supabase.ts`.
- One conventional commit per slice, on `main`.
- **The property the whole version protects:** in a Home of two or more people, no
  single member's responses can complete a Critical decision. Any change to
  participants, quorum or resolution must leave
  `tests/unit/governance-property.test.ts` passing — extend it rather than work
  around it.

### Verification before claiming anything done

```bash
npm run typecheck
npm run lint
npx vitest run
npm run build
npx playwright test    # Track B, with the app running
```

Report actual pass/fail counts, and say which failures belong to the other track's
in-flight work rather than yours.

---

## Handoff log

Append one dated line per meaningful event: a commit landed, a box ticked, a
`db reset` about to run, a blocker, a request for a file you do not own. Newest
at the bottom. This is what a cold session reads to understand what happened
since the snapshot.

| Date | Track | Event |
|---|---|---|
| 2026-08-28 | — | Plan written. State snapshot recorded above. No task started. |
