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

- [x] Root-cause and fix
- [x] `supabase db reset` and the affected suites pass — `chore-quorum` 16/16,
      `household`, `unit/governance`, `unit/governance-property` green.
      `chore-lifecycle` is 11/13: its two remaining failures are
      `permission denied for function publish_schedule_for_house`, which is
      B2's routine-grant gap and not this regression.
- [x] Commit 1: the 058 correction. `vitest.config.mts`, `tests/setup.ts`,
      `supabase/config.toml`, and the 057 and 058 slices were already carried
      into `847988b` by another process before Track A started, so commits 2
      and 3 have no content left to make.

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

- [x] `governance-notifications.test.ts` — the fixture promoted a member to
      Co-Admin with the service-role key, and since 056 the privileged-column
      trigger reads `auth.uid()`, which a service-role client has none of. The
      promotion moves to the Admin's own session and the removal goes through a
      real `remove_member` decision. Unmasking the suite surfaced two genuine
      defects in 055, both fixed: `set_notification_prefs` still wrote
      `telegram_enabled`, dropped in 044 under D-34, so every call failed with
      `42703`; and `notify_membership_change` fired only on update, while a
      membership arrives by insert, so N-41 was never written for anybody who
      joined. 17/17.
- [x] `membership.test.ts` → "leaves a removal pending while money is
      outstanding…". **Root-caused, and the fix is not in a Track A file.**
      `complete_pending_removals` is revoked from `public` by 050 and granted to
      no role, so the test's service-role call answers `42501` and the test
      ignores the error and reads the unchanged row. B2's
      `20260828090080_routine_grants.sql` already grants it to `service_role`;
      this test passes the moment that migration applies.
- [x] Commit

### A3 — Phase 11 slice 5: governed close and reopen, with `balance_adjustments`

Migration `20260828090071_governed_close_and_adjustments.sql`.

- [x] `balance_adjustments` table — house-scoped, RLS policy, isolation test,
      integer paise, referencing the decision that created it
- [x] `effect_close_settlement(decisions, jsonb)`, `effect_reopen_settlement(decisions, jsonb)`,
      `effect_balance_adjustment(decisions, jsonb)` — all two-argument, because the
      close needs apply-time numbers through `p_input`. The roadmap is explicit:
      settlement rows are written **at apply time from apply-time numbers**,
      computed by `lib/domain/settlement/netting.ts`, not at proposal time.
- [x] `revoke execute … from public, anon, authenticated` on every new `effect_*`,
      the way every existing effect does it
- [x] `POST /api/periods/[period]/close` and `/reopen` move behind a decision
      (D-59). Keep the handler's validation and authorisation; what changes is
      that it proposes rather than acts.
- [x] Tests: closing August requires the Co-Admin's acknowledgement and three
      members'; `Σ final_net = 0` still holds with adjustments in the close
      (property-test with `fast-check`, as `tests/unit/netting.test.ts` already
      does for the un-adjusted case); `apply_decision` refuses a decision that is
      not `approved`, and one missing a mandatory response, **when called with
      the service-role key**
- [x] Commit

### A4 — Phase 11 slice 6: expected contributions and the reserve

Migration `20260828090072_expected_contributions_and_reserve.sql`. Last, because
it is the only remaining slice that changes settlement arithmetic.

- [x] `member_expected_contributions`, `reserves`, `reserve_movements` — each with
      RLS and an isolation test
- [x] `effect_set_expected_contribution`, `effect_create_reserve`,
      `effect_reserve_draw`, all with execute revoked from `public`, `anon`,
      `authenticated`
- [x] The draw's effect on an expense's split, in `lib/domain/expenses/split.ts`
      and its data layer
- [x] A draw larger than the reserve balance is refused **at proposal time**, so
      the Home is never asked to approve a decision that cannot apply. In
      `lib/domain/governance/preview.ts` **and** in the database, not only in the
      route handler.
- [x] Tests: a funded reserve changes nobody's settlement position until a draw is
      applied; `Σ variance(m) + reserve_balance = 0` for the period, property-tested;
      an expected contribution set for a member charges them nothing — it changes
      the position view and no settlement figure
- [x] Commit

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
| 2026-08-28 | A | Track A started. Found the tree already committed as `847988b` (057/058/059 plus PARALLEL-PLAN.md) by another process; migrations are unpushed, so A1 fixes 058 in place. About to run `supabase db reset` — Track B, the schema rebuilds for you too. |
| 2026-08-28 | A | A1 done. 058's `chore_quorum_for` returned `auto_confirm := true` in every branch and counted eligible confirmers instead of Home size; restated on 054's table with all assignees out of the pool, and `mark_chore_done`, `confirm_chore`, `reject_chore` and the peer trigger restated with it. `quorumFor`'s new `sharedWith` parameter moved to fourth so `policy` stays third for every existing caller. Suite: 27 failures to 9. |
| 2026-08-28 | A | Blocker for B2, not touched by A: `publish_schedule_for_house` answers `42501 permission denied` to the **service-role** key, because 037 revoked it from `public` and no role holds it by name. Two `chore-lifecycle` tests fail on it. `chore_quorum_for` had the same shape and A fixed it inside 058 by granting `service_role` explicitly. B2's routine-grant migration should name `service_role` on the migration-037 service functions, or those two stay red. |
| 2026-08-28 | A | Noticed in the tree, owned by neither track's checklist yet: `20260828090059_governed_close_reopen_balance.sql` and `20260828090060_expected_contributions_reserve.sql` already exist and apply. A3 and A4 are re-scoped to verifying and finishing them rather than writing them from nothing. |
| 2026-08-28 | A | A2 done for the part Track A owns. `governance-notifications` 17/17. Two real 055 defects fixed in place: `set_notification_prefs` wrote `telegram_enabled` (dropped in 044), and `notify_membership_change` had no insert trigger, so N-41 never fired for anybody who joined. The prefs function is now 11 arguments — `(boolean x6, time, time, boolean, boolean, boolean)`, no `p_telegram_enabled` — which B2's grant list should name. Fixing 055 also clears B3's `telegram_enabled` failure in `notifications.test.ts`; B may find that box already green. |
| 2026-08-28 | A | Blocking both tracks: `20260828090080_routine_grants.sql` fails on `supabase db reset` — `ERROR: function apply_decision(uuid) does not exist (SQLSTATE 42883)` at statement 39. The real identities in the applied database are `apply_decision(p_decision_id uuid, p_input jsonb)`, `publish_schedule_for_house(uuid, date, jsonb, assignment_source, boolean, text, integer)` (080 names a five-argument form that does not exist), `enqueue_notification(uuid, uuid, text, jsonb, text, jsonb, timestamptz, text, boolean)`, and `set_notification_prefs` as above. Until 080 parses, every reset stops at it and the stack stays at 070. |
| 2026-08-28 | A | Three Track A tests are red for one reason, all of it B2's: no role holds `execute` on `publish_schedule_for_house` or `complete_pending_removals` — 037 and 050 revoked them from `public` and granted them to nobody, so even the service-role key gets `42501`. `chore-lifecycle` x2 and `membership` x1. They need `grant execute … to service_role` in 080. Everything else Track A owns is green: 548 passed, 3 failed across the A suites. |
| 2026-08-28 | A | A3 done. `20260828090071_governed_close_and_adjustments.sql` adds `balance_adjustments` (RLS read-only for the Home, no write policy — the effect is the sole writer) and two-argument `effect_close_settlement`, `effect_reopen_settlement`, `effect_balance_adjustment`. 059's one-argument versions are left untouched: 066's dispatcher prefers the two-argument overload, so this is a pure addition. The close now checks apply-time numbers rather than recomputing them in PL/pgSQL — including a per-member reconciliation between the settlement rows and the balances, which 033 never needed. `POST /api/periods/:period/close` and `/reopen` propose instead of acting; `applyIfApproved` computes the numbers when the last response lands. `tests/integration/governed-close.test.ts` is new (9 tests) and `applyAdjustments` is property-tested in `unit/netting`. Track A suites: 563 passed, 0 failed — `chore-lifecycle` and `membership` are green again, so B2's grants have landed. |
| 2026-08-28 | A | Two things fixed on the way, both Track A's own and both needed to get typecheck and lint green: (1) migration 058 added `change_confirmation_policy` to the `decision_type` enum and to nothing else, so `DecisionType`, the level/capacity/queue/label maps, the validation enum and `decision_action_phrase` all lacked the fifteenth type. The SQL phrase could not go in 055 — 055 runs before the enum value exists and a plain SQL function's body is validated at creation — so it is restated in 071, and `unit/governance-notifications` now reads the last restatement across the migrations instead of 055 only. (2) `ConfirmableAssignment.sharedWith` is now optional; it was required, which broke every pre-CE-11 caller. |
| 2026-08-28 | A | For B, not touched by A: `app/api/auth/signup/route.ts` in the working tree raises `EMAIL_CONFIRMATION_REQUIRED`, which is not in `lib/api/errors.ts`, so `npm run typecheck` fails on it. Everything Track A owns typechecks; this one line is the only error. Also noting that `lib/types/schema-pending.ts` now carries a `balance_adjustments` overlay for migration 071 — delete it the next time `gen:types` runs. |
| 2026-08-28 | A | A4 done. `20260828090072_expected_contributions_and_reserve.sql` replaces the three tables 060 built: they had the wrong shapes against `docs/04-DATABASE.md` §6 — no `decision_id` anywhere (so BR-281 and BR-287 were unenforceable, and 060 shipped a policy letting any lead write expected contributions directly), one unnamed pot per Home instead of named pots, signed movement amounts with a hand-written `balance_after`, and no funding path at all, so no draw could ever have succeeded. 072 states the spec's shapes, adds `apply_reserve_movement` (the balance is a function of the movements, and an over-draw is refused under `for update`), puts `reserve_id` on `expenses` for BR-285, and teaches `assert_split_sum` that a reserve-funded expense carries no member shares. 060 is left on disk unedited, the way 059 was left alone by 071. |
| 2026-08-28 | A | **A note for the documentation, which Track A does not own.** BR-288 states `Σ variance(m) + reserve_balance = 0`. It cannot hold alongside BR-284 and §6.5's `variance = paid − fair_share`: a Home whose only movement is one ₹5,000 contribution has `Σ variance = +5000` and a balance of `+5000`. What is conserved is the same statement with the pot's *position* — `−Σ contributions` — in place of its cash, because a draw spends the pot's cash and relieves the members of the same cost in one movement. `lib/domain/settlement/position.ts` implements and property-tests that form and says so in a comment; `docs/09-BUSINESS-RULES.md` should be corrected to match. |
| 2026-08-28 | A | Two failures left in the full run, both in Track B's suites and neither touched by Track A: `notifications.test.ts` → "replaces rather than adds when the same tag repeats inside ten minutes" gets zero rows from `enqueue_notification` called with the **service-role** key, which looks like 080 revoking it without granting it back to `service_role`; and `rls-isolation.test.ts` → "hides a housemate's profile from an unrelated user" now gets `null` rather than `[]` from a `users` select, which is an error rather than an empty result. Full run: 669 passed, 2 failed. |
| 2026-08-28 | A | The local stack was stopped and no lock was held, so every integration suite was silently skipping rather than failing — `membership.test.ts` gates on a service-role read of `invitations` and reported 7 skipped. Restarted with `supabase start` under the lock (it restored from backup; migrations through 081 are applied, B's Food schema included). If Track B stopped it deliberately, say so in this log next time — a stopped stack looks exactly like an unapplied migration to every gate in `tests/integration`. |
| 2026-08-28 | A | A2's last box is now green: `membership.test.ts` is 10/10 once 080's grant on `complete_pending_removals` is in place. **Track A's whole checklist — A1 to A4 — is done.** Full run: 669 passed, 2 failed, both in Track B's suites. |
| 2026-08-28 | A | **For B2, and this one is a live product bug rather than a test failure.** 080's blanket `revoke execute on all routines in schema public from public, anon, authenticated` stripped `shares_active_house_with(uuid)`, which is the helper inside the RLS policy on `users`. A policy helper has to be executable by the role the policy runs as, so **every authenticated read of any profile now answers `42501 permission denied for function shares_active_house_with`** — nobody can see anybody's name. `rls-isolation.test.ts` → "hides a housemate's profile from an unrelated user" is that, surfacing as `data: null` where the test expects `[]`. The other five policy helpers — `current_member`, `has_membership`, `is_house_admin`, `is_house_lead`, `is_house_member` — were granted back by name and are fine; this is the one that was missed. |
| 2026-08-28 | A | Also for B2: `enqueue_notification(uuid, uuid, text, jsonb, text, jsonb, timestamptz, text, boolean)` currently holds `execute` for **no role at all** — anon, authenticated and service_role are all false. Keeping it out of a browser's hands was the point, but the notification jobs and the test fixtures call it with the service-role key, so `notifications.test.ts` → "replaces rather than adds when the same tag repeats inside ten minutes" reads zero rows from two enqueues that both answered `42501`. It needs `grant execute … to service_role`. |
