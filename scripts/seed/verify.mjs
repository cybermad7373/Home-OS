/**
 * Coverage. The thing that stops "the demo is empty" coming back.
 *
 * Every house-scoped table is listed here exactly once, with what it means for
 * that table to be empty in a given home. Three answers are possible:
 *
 *   required   an empty table is a bug in the seed, and this exits non-zero
 *   n/a        this home's shape means the table should be empty — a pot
 *              household has no settlements, a rota household is not scored
 *   later      a real gap, named rather than hidden: the row is produced by
 *              something outside the seed
 *
 * A table added to the schema and not added here is reported as unclassified,
 * so the list cannot quietly fall behind the database.
 */
import { admin, must } from "./env.mjs";

const isSplit = (home) => home.settings.money_mode === "split";
const isPot = (home) => home.settings.money_mode === "pot";
const isPoints = (home) => home.settings.effort_mode === "points";
const always = () => true;

/**
 * table -> when a row is required. `reason` explains the exceptions, and is
 * printed rather than kept in somebody's head.
 */
const EXPECTED = {
  absence_requests: { when: always },
  availability_exceptions: { when: always },
  balance_adjustments: { when: isSplit, reason: "an adjustment is a correction to a settled month" },
  chore_assignments: { when: always },
  chore_confirmations: { when: always },
  chore_penalties: {
    when: (home) => isPoints(home) && home.settings.penalty_enabled,
    reason: "only a scored household that opted into charging has penalties",
  },
  chore_templates: { when: always },
  decisions: { when: always },
  effort_ledger: { when: isPoints, reason: "a rota household has asked not to be scored" },
  expense_categories: { when: always },
  expense_splits: { when: always },
  expenses: { when: always },
  food_preferences: { when: always },
  foods: { when: always },
  governance_policy: { when: always },
  guests: { when: always },
  home_rule_versions: { when: always },
  home_rules: { when: always },
  house_announcements: { when: always },
  house_llm_credentials: { when: always },
  house_members: { when: always },
  house_settings: { when: always },
  invitations: { when: always },
  join_requests: { when: always },
  llm_runs: {
    when: () => false,
    reason: "written by real provider calls — `npm run seed:ai` drives them",
  },
  meal_items: { when: always },
  meal_participants: { when: always },
  meal_plans: { when: always },
  meals: { when: always },
  member_availability: { when: always },
  member_expected_contributions: {
    when: isPot,
    reason: "a split household settles instead of contributing to a pot",
  },
  member_period_balances: { when: always },
  member_restrictions: { when: always },
  monthly_periods: { when: always },
  notification_prefs: { when: always },
  notifications: { when: always },
  push_subscriptions: { when: always },
  recurring_expenses: { when: always },
  reserve_movements: { when: isPot, reason: "only a pot household keeps a reserve" },
  reserves: { when: isPot, reason: "only a pot household keeps a reserve" },
  room_assignments: { when: always },
  rooms: { when: always },
  schedule_runs: { when: always },
  settlements: { when: isSplit, reason: "a pot household nets nothing between members" },
  shopping_items: { when: always },
  swap_requests: { when: always },
};

/** Tables that carry no house_id and so are checked once, not per home. */
const GLOBAL = {
  users: { when: always },
  notification_types: { when: always },
  notification_variants: { when: always },
  app_config: { when: () => false, reason: "runtime configuration, not demo data" },
};

async function houseScopedTables() {
  const { data, error } = await admin.rpc("seed_house_scoped_tables");
  if (!error && data) return data;

  // No helper function in the database, which is the normal case — fall back to
  // the list this file already knows about.
  return Object.keys(EXPECTED).map((table_name) => ({ table_name }));
}

async function countIn(table, houseId) {
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("house_id", houseId);
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0 };
}

async function countAll(table) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0 };
}

export async function report(homes) {
  const tables = (await houseScopedTables()).map((row) => row.table_name).sort();
  let failures = 0;

  console.log("\nCoverage");

  for (const home of homes) {
    const row = must(
      "select houses",
      await admin.from("houses").select("id").eq("name", home.name).maybeSingle(),
    );
    if (!row?.id) {
      console.log(`\n  ${home.name}: not seeded`);
      failures += 1;
      continue;
    }

    const missing = [];
    const skipped = [];
    let filled = 0;

    for (const table of tables) {
      const rule = EXPECTED[table];
      const { count, error } = await countIn(table, row.id);
      if (error) {
        missing.push(`${table} (${error})`);
        continue;
      }
      if (count > 0) {
        filled += 1;
        continue;
      }
      if (!rule) {
        missing.push(`${table} (unclassified — add it to verify.mjs)`);
        continue;
      }
      if (rule.when(home)) missing.push(table);
      else skipped.push(`${table} — ${rule.reason ?? "not applicable to this home"}`);
    }

    const total = tables.length;
    console.log(`\n  ${home.name}  ${filled}/${total} tables filled`);
    for (const note of skipped) console.log(`    not applicable  ${note}`);
    for (const table of missing) console.log(`    EMPTY           ${table}`);
    failures += missing.length;
  }

  console.log("");
  for (const [table, rule] of Object.entries(GLOBAL)) {
    const { count } = await countAll(table);
    if (count > 0) continue;
    if (rule.when()) {
      console.log(`  EMPTY  ${table}`);
      failures += 1;
    } else {
      console.log(`  not applicable  ${table} — ${rule.reason}`);
    }
  }

  if (failures > 0) {
    console.log(`\n${failures} table${failures === 1 ? "" : "s"} that should have rows are empty.\n`);
    process.exitCode = 1;
  } else {
    console.log("Every table that should have rows has them.\n");
  }
}
