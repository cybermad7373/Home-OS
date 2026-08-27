/**
 * Seeds a demo house with real data, so the app can be looked at rather than
 * imagined.
 *
 *   node scripts/seed-demo.mjs          # create or top up
 *   node scripts/seed-demo.mjs --reset  # delete it and start over
 *
 * Reads .env.local. Uses the service-role key, so it never runs in a browser
 * and never ships anywhere. Creates eight confirmed accounts, all with the same
 * password, a house with rooms and rent, this month's expenses part-logged, and
 * last month closed with its settlements outstanding — which is the state where
 * the most screens have something to show.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error("Missing Supabase settings in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

void anonKey; // kept in the checks above so a half-filled .env.local fails loudly

const PASSWORD = "demo1234";
const HOUSE_NAME = "Anna Nagar Boys";

const PEOPLE = [
  { username: "demo", name: "Ravi Kumar", role: "admin", canCook: true, upi: "ravi@okhdfc" },
  { username: "kumar", name: "Kumar S", role: "member", canCook: true, upi: "kumar@okaxis" },
  { username: "vinoth", name: "Vinoth R", role: "member", canCook: false, upi: "vinoth@oksbi" },
  { username: "suresh", name: "Suresh M", role: "member", canCook: false, upi: null },
  { username: "arun", name: "Arun P", role: "member", canCook: true, upi: "arun@okicici" },
  { username: "deepak", name: "Deepak V", role: "member", canCook: false, upi: null },
  { username: "manoj", name: "Manoj K", role: "member", canCook: false, upi: "manoj@okhdfc" },
  { username: "sathish", name: "Sathish B", role: "member", canCook: false, upi: null },
];

const ROOMS = [
  { name: "Front room", capacity: 3, rentPaise: 900000 },
  { name: "Middle room", capacity: 3, rentPaise: 900000 },
  { name: "Back room", capacity: 2, rentPaise: 700000 },
];

/** Realistic house spending: what it was for, how much, who tends to pay. */
const SPEND = [
  ["Groceries", "Weekly vegetables", 124000],
  ["Groceries", "Rice, dal and oil", 218750],
  ["Groceries", "Milk and eggs", 24050],
  ["Gas", "Cylinder refill", 95500],
  ["Internet", "Broadband", 89900],
  ["Maid", "Monthly", 250000],
  ["Eating out", "Sunday biryani", 172000],
  ["Household", "Cleaning supplies", 41275],
  ["Utilities", "Electricity", 312600],
  ["Groceries", "Fruit and snacks", 68325],
  ["Eating out", "Late night dosa", 33500],
  ["Household", "New mop and bucket", 57000],
];

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The Monday on or before a date. */
function weekStartOf(isoDate) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const isoDayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (isoDayOfWeek - 1));
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayInKolkata() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Equal split with the remainder handed out one paisa at a time, by member id. */
function splitEqual(amountPaise, memberIds) {
  const ids = [...memberIds].sort();
  const base = Math.floor(amountPaise / ids.length);
  const remainder = amountPaise - base * ids.length;
  return ids.map((id, index) => ({
    member_id: id,
    share_paise: base + (index < remainder ? 1 : 0),
    guest_share_paise: 0,
  }));
}

async function findExistingHouse() {
  const { data } = await admin
    .from("houses")
    .select("id")
    .eq("name", HOUSE_NAME)
    .maybeSingle();
  return data?.id ?? null;
}

async function wipe(houseId) {
  console.log("Removing the existing demo house…");
  await admin.from("settlements").delete().eq("house_id", houseId);
  await admin.from("member_period_balances").delete().eq("house_id", houseId);
  await admin.from("expenses").delete().eq("house_id", houseId);
  await admin.from("houses").delete().eq("id", houseId);

  for (const person of PEOPLE) {
    const { data } = await admin
      .from("users")
      .select("id")
      .eq("email", `${person.username}@houseos.dev`)
      .maybeSingle();
    if (data?.id) await admin.auth.admin.deleteUser(data.id);
  }
}

async function main() {
  const reset = process.argv.includes("--reset");
  const existing = await findExistingHouse();

  if (existing && reset) {
    await wipe(existing);
  } else if (existing) {
    console.log("The demo house already exists. Re-run with --reset to rebuild it.");
    console.log(`\n  Sign in:  demo  /  ${PASSWORD}\n`);
    return;
  }

  // 1. Accounts, pre-confirmed so nobody has to open an inbox.
  console.log("Creating accounts…");
  const userIds = [];
  for (const person of PEOPLE) {
    const email = `${person.username}@houseos.dev`;
    const { data: found } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (found?.id) {
      userIds.push(found.id);
      continue;
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: person.name, username: person.username },
    });
    if (error) throw error;
    userIds.push(data.user.id);
  }

  // 2. The house.
  //
  //    Written with the service role rather than through create_house, because
  //    that function needs a signed-in caller and the seed has to work even
  //    when every sign-in method is switched off in the project. The rows it
  //    writes are the same ones create_house would.
  console.log("Creating the house…");
  const inviteCode = "DEMO24";

  const { data: house, error: houseError } = await admin
    .from("houses")
    .insert({
      name: HOUSE_NAME,
      address: "12 Second Street, Anna Nagar",
      timezone: "Asia/Kolkata",
      currency: "INR",
      invite_code: inviteCode,
      created_by: userIds[0],
    })
    .select("id")
    .single();
  if (houseError) throw houseError;
  const houseId = house.id;

  await admin.from("house_settings").insert({ house_id: houseId });
  await admin.from("house_members").insert({
    house_id: houseId,
    user_id: userIds[0],
    role: "admin",
    status: "active",
    can_cook: PEOPLE[0].canCook,
  });

  const DEFAULT_CATEGORIES = [
    ["Groceries", "🥬"],
    ["Rent", "🏠"],
    ["Utilities", "⚡"],
    ["Gas", "🔥"],
    ["Internet", "📶"],
    ["Maid", "🧹"],
    ["Eating out", "🍽"],
    ["Household", "🧺"],
    ["Other", "📦"],
  ];
  await admin.from("expense_categories").insert(
    DEFAULT_CATEGORIES.map(([name, icon]) => ({ house_id: houseId, name, icon })),
  );

  const today = todayInKolkata();
  const [year, month] = today.split("-").map(Number);
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  const thisPeriod = `${year}-${String(month).padStart(2, "0")}`;
  const lastPeriod = `${previousYear}-${String(previousMonth).padStart(2, "0")}`;
  const joined = isoDate(previousYear, previousMonth, 1);

  await admin.from("house_members").update({ joined_date: joined }).eq("house_id", houseId);
  await admin
    .from("users")
    .update({ upi_vpa: PEOPLE[0].upi })
    .eq("id", userIds[0]);

  // 3. The other seven, straight to active.
  console.log("Adding the housemates…");
  for (let index = 1; index < PEOPLE.length; index += 1) {
    const person = PEOPLE[index];
    await admin.from("house_members").insert({
      house_id: houseId,
      user_id: userIds[index],
      role: person.role,
      status: "active",
      can_cook: person.canCook,
      joined_date: joined,
    });
    if (person.upi) {
      await admin.from("users").update({ upi_vpa: person.upi }).eq("id", userIds[index]);
    }
  }

  const { data: memberRows } = await admin
    .from("house_members")
    .select("id, user_id")
    .eq("house_id", houseId);

  const memberByUser = new Map(memberRows.map((row) => [row.user_id, row.id]));
  const memberIds = userIds.map((userId) => memberByUser.get(userId));

  // 4. Rooms, and everybody in one.
  console.log("Setting up rooms…");
  const roomIds = [];
  for (const room of ROOMS) {
    const { data } = await admin
      .from("rooms")
      .insert({
        house_id: houseId,
        name: room.name,
        capacity: room.capacity,
        monthly_rent_paise: room.rentPaise,
      })
      .select("id")
      .single();
    roomIds.push(data.id);
  }

  const occupancy = [0, 0, 0, 1, 1, 1, 2, 2]; // 3 / 3 / 2
  for (let index = 0; index < memberIds.length; index += 1) {
    await admin.from("room_assignments").insert({
      house_id: houseId,
      room_id: roomIds[occupancy[index]],
      member_id: memberIds[index],
      from_date: joined,
    });
  }

  const { data: categories } = await admin
    .from("expense_categories")
    .select("id, name")
    .eq("house_id", houseId);
  const categoryByName = new Map(categories.map((row) => [row.name, row.id]));

  // 5. Expenses. Three people front nearly everything — the concentration the
  //    product exists to make visible.
  async function logExpense(period, day, categoryName, description, amountPaise, payerIndex, status = "approved") {
    const { data: periodId } = await admin.rpc("ensure_period", {
      p_house_id: houseId,
      p_period: period,
    });

    const { data: expense, error } = await admin
      .from("expenses")
      .insert({
        house_id: houseId,
        period_id: periodId,
        paid_by_member_id: memberIds[payerIndex],
        category_id: categoryByName.get(categoryName),
        amount_paise: amountPaise,
        description,
        expense_date: `${period}-${String(day).padStart(2, "0")}`,
        status,
        created_by: memberIds[payerIndex],
      })
      .select("id")
      .single();
    if (error) throw error;

    const shares = splitEqual(amountPaise, memberIds).map((share) => ({
      ...share,
      house_id: houseId,
      expense_id: expense.id,
    }));
    const { error: splitError } = await admin.from("expense_splits").insert(shares);
    if (splitError) throw splitError;

    return expense.id;
  }

  console.log("Logging last month…");
  for (const [index, [category, description, amountPaise]] of SPEND.entries()) {
    await logExpense(
      lastPeriod,
      (index % 26) + 1,
      category,
      description,
      amountPaise,
      index % 3,
    );
  }
  await logExpense(lastPeriod, 1, "Rent", "Rent", 2500000, 0);

  console.log("Logging this month…");
  const dayCap = Math.min(Number(today.split("-")[2]), 26);
  for (const [index, [category, description, amountPaise]] of SPEND.slice(0, 7).entries()) {
    await logExpense(
      thisPeriod,
      Math.max(1, ((index * 3) % dayCap) + 1),
      category,
      description,
      amountPaise,
      index % 3,
    );
  }

  // One waiting for approval, so the approvals screen has something on it.
  await logExpense(thisPeriod, Math.max(1, dayCap - 1), "Utilities", "Electricity", 312600, 1, "pending_approval");

  // 6. Close last month, so the settle screen has real payments on it.
  console.log("Closing last month…");
  const { data: lastPeriodId } = await admin.rpc("ensure_period", {
    p_house_id: houseId,
    p_period: lastPeriod,
  });

  const { data: closedExpenses } = await admin
    .from("expenses")
    .select("amount_paise, paid_by_member_id")
    .eq("period_id", lastPeriodId)
    .eq("status", "approved");

  const { data: closedSplits } = await admin
    .from("expense_splits")
    .select("member_id, share_paise, guest_share_paise, expenses!inner(period_id, status)")
    .eq("house_id", houseId)
    .eq("expenses.period_id", lastPeriodId)
    .eq("expenses.status", "approved");

  const paid = new Map();
  for (const expense of closedExpenses) {
    paid.set(
      expense.paid_by_member_id,
      (paid.get(expense.paid_by_member_id) ?? 0) + expense.amount_paise,
    );
  }
  const share = new Map();
  for (const split of closedSplits) {
    share.set(
      split.member_id,
      (share.get(split.member_id) ?? 0) + split.share_paise + split.guest_share_paise,
    );
  }

  const balances = memberIds.map((memberId) => {
    const total_paid_paise = paid.get(memberId) ?? 0;
    const fair_share_paise = share.get(memberId) ?? 0;
    const net = total_paid_paise - fair_share_paise;
    return {
      member_id: memberId,
      total_paid_paise,
      fair_share_paise,
      expense_net_paise: net,
      penalty_owed_paise: 0,
      penalty_credit_paise: 0,
      final_net_paise: net,
    };
  });

  const sum = balances.reduce((total, balance) => total + balance.final_net_paise, 0);
  if (sum !== 0) throw new Error(`Seed balances do not net to zero: ${sum}`);

  const debtors = balances
    .filter((balance) => balance.final_net_paise < 0)
    .map((balance) => ({ id: balance.member_id, amount: -balance.final_net_paise }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = balances
    .filter((balance) => balance.final_net_paise > 0)
    .map((balance) => ({ id: balance.member_id, amount: balance.final_net_paise }))
    .sort((a, b) => b.amount - a.amount);

  const payments = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amount = Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount);
    payments.push({
      from_member_id: debtors[debtorIndex].id,
      to_member_id: creditors[creditorIndex].id,
      amount_paise: amount,
    });
    debtors[debtorIndex].amount -= amount;
    creditors[creditorIndex].amount -= amount;
    if (debtors[debtorIndex].amount === 0) debtorIndex += 1;
    if (creditors[creditorIndex].amount === 0) creditorIndex += 1;
  }

  // Written directly for the same reason as the house: close_period needs a
  // signed-in admin. The checks it enforces are applied above — the balances
  // are asserted to net to zero before anything is stored.
  await admin.from("member_period_balances").insert(
    balances.map((balance) => ({ ...balance, house_id: houseId, period_id: lastPeriodId })),
  );

  const { error: closeError } = await admin.from("settlements").insert(
    payments.map((payment) => ({
      ...payment,
      house_id: houseId,
      period_id: lastPeriodId,
    })),
  );
  if (closeError) throw closeError;

  const { data: closedTotals } = await admin
    .from("expenses")
    .select("amount_paise")
    .eq("period_id", lastPeriodId)
    .eq("status", "approved");

  await admin
    .from("monthly_periods")
    .update({
      status: "closing",
      total_expense_paise: closedTotals.reduce(
        (total, row) => total + row.amount_paise,
        0,
      ),
      closed_by: memberIds[0],
      closed_at: new Date().toISOString(),
    })
    .eq("id", lastPeriodId);

  // A couple already marked paid, one confirmed, so the settle screen shows
  // every state at once rather than a wall of "pending".
  const { data: settlements } = await admin
    .from("settlements")
    .select("id")
    .eq("period_id", lastPeriodId)
    .order("amount_paise", { ascending: false });

  if (settlements.length > 0) {
    await admin
      .from("settlements")
      .update({ status: "marked_paid", marked_paid_at: new Date().toISOString() })
      .eq("id", settlements[0].id);
  }
  if (settlements.length > 2) {
    await admin
      .from("settlements")
      .update({
        status: "confirmed",
        marked_paid_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", settlements[2].id);
  }

  // 7. A generated week of chores, so the chore screens have something on them.
  console.log("Generating a week of chores…");

  const { data: templates } = await admin
    .from("chore_templates")
    .select("*")
    .eq("house_id", houseId)
    .eq("active", true);

  const monday = weekStartOf(today);
  const dates = Array.from({ length: 7 }, (_, offset) => addDays(monday, offset));

  const instances = [];
  for (const template of templates ?? []) {
    if (template.frequency === "daily") {
      dates.forEach((date) => instances.push({ template, date }));
    } else if (template.frequency === "weekly") {
      instances.push({ template, date: dates[2] });
    } else {
      const count = Math.min(7, template.times_per_week ?? 1);
      for (let index = 0; index < count; index += 1) {
        instances.push({ template, date: dates[Math.round((index * 7) / count)] });
      }
    }
  }

  // Round-robin, skipping anybody who cannot cook when the chore needs one.
  const cooks = PEOPLE.map((person, index) => ({ index, canCook: person.canCook }));
  let turn = 0;

  const assignments = instances.map(({ template, date }) => {
    let assigneeIndex;
    for (let attempt = 0; attempt < PEOPLE.length; attempt += 1) {
      const candidate = cooks[(turn + attempt) % PEOPLE.length];
      if (!template.requires_cooking_skill || candidate.canCook) {
        assigneeIndex = candidate.index;
        turn = (turn + attempt + 1) % PEOPLE.length;
        break;
      }
    }

    const slotBounds = {
      morning: ["06:00", "12:00"],
      evening: ["17:00", "23:00"],
      any: ["06:00", "23:00"],
    }[template.slot];

    return {
      house_id: houseId,
      template_id: template.id,
      assignee_member_id: assigneeIndex === undefined ? null : memberIds[assigneeIndex],
      chore_date: date,
      slot: template.slot,
      window_start: `${date}T${slotBounds[0]}:00Z`,
      window_end: `${date}T${slotBounds[1]}:00Z`,
      deadline: `${date}T23:59:00Z`,
      effort_points: template.effort_points,
      duration_min: template.duration_min,
      status: assigneeIndex === undefined ? "open" : "assigned",
    };
  });

  const { data: run } = await admin
    .from("schedule_runs")
    .insert({
      house_id: houseId,
      week_start: monday,
      generator: "engine",
      total_points: assignments.reduce((sum, row) => sum + row.effort_points, 0),
      unassigned_count: assignments.filter((row) => row.status === "open").length,
      max_deviation: 12,
    })
    .select("id")
    .single();

  const { data: inserted } = await admin
    .from("chore_assignments")
    .insert(assignments.map((row) => ({ ...row, schedule_run_id: run.id })))
    .select("id, assignee_member_id, chore_date, effort_points");

  // Some already done and confirmed, some waiting, some missed — so every state
  // in the lifecycle is visible on the screens rather than a wall of "to do".
  const past = (inserted ?? []).filter((row) => row.chore_date < today);
  for (const [index, assignment] of past.entries()) {
    if (!assignment.assignee_member_id) continue;

    if (index % 5 === 4) {
      await admin
        .from("chore_assignments")
        .update({ status: "missed" })
        .eq("id", assignment.id);
      continue;
    }

    // Confirmed by whoever is not the assignee, which the constraint requires.
    const confirmer = memberIds.find((id) => id !== assignment.assignee_member_id);
    await admin
      .from("chore_assignments")
      .update({
        status: index % 4 === 3 ? "done_pending" : "confirmed",
        done_at: new Date().toISOString(),
        ...(index % 4 === 3
          ? {}
          : { confirmed_by: confirmer, confirmed_at: new Date().toISOString() }),
      })
      .eq("id", assignment.id);
  }

  // Close the week that just ended, so the leaderboard has history behind it.
  const lastMonday = addDays(monday, -7);
  const { data: activeMembers } = await admin
    .from("house_members")
    .select("id")
    .eq("house_id", houseId)
    .eq("status", "active");

  await admin.from("effort_ledger").upsert(
    activeMembers.map((member, index) => {
      // Deliberately uneven: three people carrying, the rest coasting. That is
      // the problem the product exists to make visible.
      const earned = [380, 340, 280, 95, 140, 120, 110, 105][index] ?? 100;
      const target = 260;
      return {
        house_id: houseId,
        member_id: member.id,
        week_start: lastMonday,
        base_target: target,
        effective_target: target,
        earned_points: earned,
        carry_out: earned - target,
        confirmed_count: Math.round(earned / 20),
        missed_count: earned < 150 ? 6 : 0,
      };
    }),
    { onConflict: "house_id,member_id,week_start" },
  );

  console.log(`
Demo house ready.

  House        ${HOUSE_NAME}
  Invite code  ${inviteCode}
  Sign in      demo  /  ${PASSWORD}          (admin)
  Others       kumar, vinoth, suresh, arun, deepak, manoj, sathish  — same password

  ${lastPeriod}  closed, ${payments.length} payments outstanding
  ${thisPeriod}  open, one expense waiting for approval
  ${monday}  chores generated, some done, some waiting, some missed
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
