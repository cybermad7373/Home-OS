/**
 * The money: a month that is closed and being settled, a month that is open,
 * and the standing arrangements behind both.
 *
 * Everything here is integer paise. The database asserts that an expense's
 * splits sum to it exactly and refuses to touch a closed period at all, so the
 * order matters: log everything, then close.
 */
import { admin, insertOne, must } from "./env.mjs";
import { appliedDecision } from "./governance.mjs";
import {
  addDays,
  at,
  hoursAgo,
  isoDate,
  periodOf,
  previousPeriod,
  splitEqual,
  transfers,
} from "./util.mjs";

/** What a shared house in Chennai actually spends on, and roughly what it costs. */
const SPEND = {
  tamil: [
    ["Groceries", "Weekly vegetables from Koyambedu", 124_000],
    ["Groceries", "Rice, dal and cooking oil", 218_750],
    ["Groceries", "Milk and eggs", 24_050],
    ["Gas", "Cylinder refill", 95_500],
    ["Internet", "Broadband — monthly", 89_900],
    ["Maid", "Kamala — monthly", 250_000],
    ["Eating out", "Sunday biryani for the house", 172_000],
    ["Household", "Phenyl, detergent, dish bar", 41_275],
    ["Utilities", "Electricity", 312_600],
    ["Groceries", "Fruit and evening snacks", 68_325],
    ["Eating out", "Late night dosa run", 33_500],
    ["Household", "New mop and bucket", 57_000],
    ["Groceries", "Chicken and mutton for Sunday", 96_400],
    ["Other", "Water can delivery", 18_000],
  ],
  mixed: [
    ["Groceries", "Weekly vegetables", 88_000],
    ["Groceries", "Rice, atta and oil", 164_500],
    ["Groceries", "Milk, curd and eggs", 31_200],
    ["Gas", "Cylinder refill", 95_500],
    ["Internet", "Fibre — monthly", 74_900],
    ["Maid", "Lakshmi — monthly", 200_000],
    ["Eating out", "Friday order in", 118_000],
    ["Household", "Cleaning supplies", 33_400],
    ["Utilities", "Electricity", 214_800],
    ["Groceries", "Fruit and snacks", 42_600],
    ["Other", "Water cans", 24_000],
  ],
  north: [
    ["Groceries", "Sabzi and fruit", 96_000],
    ["Groceries", "Atta, dal, ghee", 232_000],
    ["Groceries", "Milk, paneer, curd", 58_400],
    ["Gas", "Cylinder refill", 95_500],
    ["Internet", "Broadband — monthly", 99_900],
    ["Maid", "Sunita — monthly", 300_000],
    ["Eating out", "Sunday chaat outing", 84_000],
    ["Household", "Cleaning and laundry supplies", 47_800],
    ["Utilities", "Electricity", 386_200],
    ["Groceries", "School snacks for the week", 36_500],
    ["Other", "Newspaper and milk bill", 21_000],
  ],
};

/**
 * A payer index per expense. Three people front nearly everything, which is
 * the concentration the product exists to make visible — a demo where the
 * spend is spread evenly has nothing to say.
 */
function payerFor(index, count) {
  return [0, 1, 0, 2, 1, 0, 1, 0, 2, 0, 1, 2][index % 12] % count;
}

async function ensurePeriod(houseId, period) {
  const { data, error } = await admin.rpc("ensure_period", {
    p_house_id: houseId,
    p_period: period,
  });
  if (error) throw new Error(`ensure_period ${period}: ${error.message}`);
  return data;
}

/**
 * One expense and its splits, written together so the deferred sum check sees
 * a complete set.
 *
 * `guestShare` moves part of the host's own share into the guest column rather
 * than adding to the total: a guest eats the house's food, they do not increase
 * what the shop charged.
 */
async function logExpense(context, spec) {
  const { houseId, payerIds, categoryByName } = context;
  const periodId = await ensurePeriod(houseId, spec.period);
  const payer = payerIds[spec.payer];

  const expense = await insertOne("expenses", {
    house_id: houseId,
    period_id: periodId,
    paid_by_member_id: payer,
    category_id: categoryByName.get(spec.category),
    amount_paise: spec.amountPaise,
    description: spec.description,
    expense_date: spec.date,
    split_basis: spec.basis ?? "equal",
    status: spec.status ?? "approved",
    approved_by: spec.approvedBy ?? null,
    approved_at: spec.approvedBy ? at(spec.date, "20:00") : null,
    rejection_reason: spec.rejectionReason ?? null,
    created_by: payer,
    created_at: at(spec.date, "19:30"),
  });

  const shares = spec.shares ?? splitEqual(spec.amountPaise, payerIds);
  const rows = shares.map((share) => ({
    house_id: houseId,
    expense_id: expense.id,
    member_id: share.member_id,
    share_paise: share.share_paise,
    guest_share_paise: share.guest_share_paise ?? 0,
    basis_note: spec.basisNote ?? null,
  }));

  must("insert expense_splits", await admin.from("expense_splits").insert(rows).select("id"));
  return { id: expense.id, periodId };
}

/** Rent split by the room somebody actually sleeps in, not by head count. */
function rentShares(home, context) {
  const shares = [];
  for (const [index, memberId] of context.payerIds.entries()) {
    const roomIndex = home.occupancy[index];
    const occupants = home.occupancy.filter((value) => value === roomIndex).length;
    shares.push({
      member_id: memberId,
      share_paise: Math.round(home.rooms[roomIndex].rentPaise / occupants),
    });
  }
  return shares;
}

export async function seedMoney(context) {
  const { houseId, payerIds, memberIds, today, home, guestId } = context;
  void guestId;
  const thisPeriod = periodOf(today);
  const lastPeriod = previousPeriod(thisPeriod);
  const [lastYear, lastMonth] = lastPeriod.split("-").map(Number);
  const catalogue = SPEND[home.cuisine];
  const dayOfMonth = Number(today.slice(8, 10));

  // ------------------------------------------------------------ last month
  for (const [index, [category, description, amountPaise]] of catalogue.entries()) {
    await logExpense(context, {
      period: lastPeriod,
      date: isoDate(lastYear, lastMonth, ((index * 2) % 26) + 1),
      category,
      description,
      amountPaise,
      payer: payerFor(index, payerIds.length),
      approvedBy: payerIds[(payerFor(index, payerIds.length) + 1) % payerIds.length],
    });
  }

  if (home.rentPaise > 0) {
    await logExpense(context, {
      period: lastPeriod,
      date: isoDate(lastYear, lastMonth, 1),
      category: "Rent",
      description: "Rent",
      amountPaise: home.rentPaise,
      payer: 0,
      basis: "room_rent",
      basisNote: "By room",
      shares: rentShares(home, context),
      approvedBy: payerIds[1],
    });
  }

  // ------------------------------------------------------------ this month
  const openDay = (offset) => Math.max(1, Math.min(dayOfMonth, ((offset * 3) % 26) + 1));
  for (const [index, [category, description, amountPaise]] of catalogue.slice(0, 7).entries()) {
    await logExpense(context, {
      period: thisPeriod,
      date: `${thisPeriod}-${String(openDay(index)).padStart(2, "0")}`,
      category,
      description,
      amountPaise,
      payer: payerFor(index, payerIds.length),
    });
  }

  // One waiting on somebody other than the payer, so the approvals queue is
  // not empty, and one that was actually turned down, so the rejected state
  // has somewhere to be seen.
  await logExpense(context, {
    period: thisPeriod,
    date: `${thisPeriod}-${String(Math.max(1, dayOfMonth - 1)).padStart(2, "0")}`,
    category: "Utilities",
    description: "Electricity — higher than usual",
    amountPaise: home.cuisine === "north" ? 386_200 : 312_600,
    payer: 1 % payerIds.length,
    status: "pending_approval",
  });

  await logExpense(context, {
    period: thisPeriod,
    date: `${thisPeriod}-${String(Math.max(1, dayOfMonth - 4)).padStart(2, "0")}`,
    category: "Eating out",
    description: "Dinner out — four of us, not the house",
    amountPaise: 168_000,
    payer: 2 % payerIds.length,
    status: "rejected",
    rejectionReason: "Only four people went. This one is not the house's.",
  });

  // ------------------------------------------------------------- recurring
  const rentCategory = home.rentPaise > 0 ? "Rent" : "Utilities";
  must(
    "insert recurring_expenses",
    await admin
      .from("recurring_expenses")
      .insert(
        [
          home.rentPaise > 0 && {
            house_id: houseId,
            name: "Rent",
            amount_paise: home.rentPaise,
            category_id: context.categoryByName.get(rentCategory),
            paid_by_member_id: payerIds[0],
            split_basis: "room_rent",
            day_of_month: 1,
            auto_approve: true,
            next_run_date: nextRun(today, 1),
          },
          {
            house_id: houseId,
            name: "Broadband",
            amount_paise: home.cuisine === "north" ? 99_900 : 89_900,
            category_id: context.categoryByName.get("Internet"),
            paid_by_member_id: payerIds[1 % payerIds.length],
            split_basis: "equal",
            day_of_month: 5,
            auto_approve: true,
            next_run_date: nextRun(today, 5),
          },
          {
            house_id: houseId,
            name: "Maid",
            amount_paise: home.cuisine === "north" ? 300_000 : 250_000,
            category_id: context.categoryByName.get("Maid"),
            paid_by_member_id: payerIds[0],
            split_basis: "equal",
            day_of_month: 3,
            auto_approve: false,
            next_run_date: nextRun(today, 3),
          },
        ].filter(Boolean),
      )
      .select("id"),
  );

  // Budgets, so the categories screen has something to be over or under.
  const budgets = { Groceries: 600_000, "Eating out": 250_000, Utilities: 400_000, Household: 120_000 };
  for (const [name, budget] of Object.entries(budgets)) {
    const id = context.categoryByName.get(name);
    if (id) await admin.from("expense_categories").update({ monthly_budget_paise: budget }).eq("id", id);
  }

  // ------------------------------------------------- close the month behind
  const lastPeriodId = await ensurePeriod(houseId, lastPeriod);
  const balances = await computeBalances(context, lastPeriodId);

  // Penalties only exist where the house scores effort and asked to be charged
  // for falling short. They move money between members, so they are applied to
  // the balances before anybody is told who pays whom.
  if (home.settings.effort_mode === "points" && home.settings.penalty_enabled) {
    await applyPenalties(context, lastPeriodId, balances);
  }

  const drift = balances.reduce((total, row) => total + row.final_net_paise, 0);
  if (drift !== 0) throw new Error(`${home.name}: closed balances do not net to zero (${drift})`);

  must(
    "insert member_period_balances",
    await admin
      .from("member_period_balances")
      .insert(balances.map((row) => ({ ...row, house_id: houseId, period_id: lastPeriodId })))
      .select("id"),
  );

  // A pot household nets nothing between members — the pot pays, and what is
  // owed is a contribution to it, not a transfer to a person. So it gets no
  // settlement rows, which is exactly why /settle hides itself there.
  if (home.settings.money_mode === "split") {
    await seedSettlements(context, lastPeriodId, balances);
  }

  const total = balances.reduce((sum, row) => sum + row.total_paid_paise, 0);
  must(
    "close monthly_periods",
    await admin
      .from("monthly_periods")
      .update({
        status: "closed",
        total_expense_paise: total,
        total_penalty_paise: balances.reduce((sum, row) => sum + row.penalty_owed_paise, 0),
        closed_by: memberIds[0],
        closed_at: hoursAgo(50),
        locked_at: hoursAgo(50),
      })
      .eq("id", lastPeriodId)
      .select("id"),
  );

  // ------------------------------------------------------- pot arrangements
  if (home.settings.money_mode === "pot" && home.pot) {
    await seedPot(context, await ensurePeriod(houseId, thisPeriod));
  }

  // One recorded correction to a closed month. It needs a decision behind it,
  // which is the point: nothing moves money after the fact without one.
  if (home.settings.money_mode === "split" && payerIds.length >= 3) {
    const decision = await appliedDecision(houseId, memberIds[0], {
      type: "balance_adjustment",
      level: "important",
      payload: { amount_paise: 45_000 },
      reason: "Vinoth paid the gas in cash and it never got logged before close.",
    });
    await insertOne("balance_adjustments", {
      house_id: houseId,
      period_id: lastPeriodId,
      decision_id: decision.id,
      from_member_id: payerIds[0],
      to_member_id: payerIds[2],
      amount_paise: 45_000,
      reason: "Cash payment for the gas cylinder, logged after close",
    });
  }
}

function nextRun(today, dayOfMonth) {
  const [year, month, day] = today.split("-").map(Number);
  if (day < dayOfMonth) return isoDate(year, month, dayOfMonth);
  return month === 12 ? isoDate(year + 1, 1, dayOfMonth) : isoDate(year, month + 1, dayOfMonth);
}

async function computeBalances(context, periodId) {
  const { houseId, payerIds } = context;

  const expenses = must(
    "select expenses",
    await admin
      .from("expenses")
      .select("amount_paise, paid_by_member_id")
      .eq("period_id", periodId)
      .eq("status", "approved"),
  );

  const splits = must(
    "select expense_splits",
    await admin
      .from("expense_splits")
      .select("member_id, share_paise, guest_share_paise, expenses!inner(period_id, status)")
      .eq("house_id", houseId)
      .eq("expenses.period_id", periodId)
      .eq("expenses.status", "approved"),
  );

  const paid = new Map();
  for (const expense of expenses) {
    paid.set(
      expense.paid_by_member_id,
      (paid.get(expense.paid_by_member_id) ?? 0) + expense.amount_paise,
    );
  }
  const share = new Map();
  for (const split of splits) {
    share.set(
      split.member_id,
      (share.get(split.member_id) ?? 0) + split.share_paise + split.guest_share_paise,
    );
  }

  return payerIds.map((memberId) => {
    const totalPaid = paid.get(memberId) ?? 0;
    const fairShare = share.get(memberId) ?? 0;
    return {
      member_id: memberId,
      total_paid_paise: totalPaid,
      fair_share_paise: fairShare,
      expense_net_paise: totalPaid - fairShare,
      penalty_owed_paise: 0,
      penalty_credit_paise: 0,
      final_net_paise: totalPaid - fairShare,
    };
  });
}

/**
 * Deficit is charged at the house rate and the money goes to whoever carried
 * more than their share. It has to net to zero across the house, so the credit
 * is distributed in proportion to surplus with the remainder to the largest.
 */
async function applyPenalties(context, periodId, balances) {
  const { houseId, home } = context;
  const rate = home.settings.penalty_rate_paise;

  // Deliberately uneven: a few people carrying the house, a few coasting. That
  // imbalance is the thing the effort score exists to surface.
  const points = [46, 30, 18, -24, -14, -22, -18, -16];
  const rows = balances.map((balance, index) => {
    const value = points[index % points.length];
    return {
      member_id: balance.member_id,
      deficit_points: value < 0 ? -value : 0,
      surplus_points: value > 0 ? value : 0,
    };
  });

  const owed = rows.map((row) => row.deficit_points * rate);
  const totalOwed = owed.reduce((sum, value) => sum + value, 0);
  const totalSurplus = rows.reduce((sum, row) => sum + row.surplus_points, 0);

  let distributed = 0;
  const credit = rows.map((row, index) => {
    if (totalSurplus === 0 || row.surplus_points === 0) return 0;
    const isLast = rows.findLastIndex((candidate) => candidate.surplus_points > 0) === index;
    if (isLast) return totalOwed - distributed;
    const value = Math.floor((totalOwed * row.surplus_points) / totalSurplus);
    distributed += value;
    return value;
  });

  const penalties = rows.map((row, index) => ({
    house_id: houseId,
    period_id: periodId,
    member_id: row.member_id,
    deficit_points: row.deficit_points,
    surplus_points: row.surplus_points,
    rate_paise: rate,
    amount_owed_paise: owed[index],
    amount_credited_paise: credit[index],
  }));

  must("insert chore_penalties", await admin.from("chore_penalties").insert(penalties).select("id"));

  for (const [index, balance] of balances.entries()) {
    balance.penalty_owed_paise = owed[index];
    balance.penalty_credit_paise = credit[index];
    balance.final_net_paise = balance.expense_net_paise - owed[index] + credit[index];
  }
}

/** Every settlement state at once, rather than a wall of "pending". */
async function seedSettlements(context, periodId, balances) {
  const { houseId } = context;
  const payments = transfers(balances);
  if (payments.length === 0) return;

  const rows = must(
    "insert settlements",
    await admin
      .from("settlements")
      .insert(payments.map((payment) => ({ ...payment, house_id: houseId, period_id: periodId })))
      .select("id, amount_paise")
      .order("amount_paise", { ascending: false }),
  );

  if (rows[0]) {
    await admin
      .from("settlements")
      .update({ status: "marked_paid", marked_paid_at: hoursAgo(20) })
      .eq("id", rows[0].id);
  }
  if (rows[2]) {
    await admin
      .from("settlements")
      .update({
        status: "confirmed",
        marked_paid_at: hoursAgo(40),
        confirmed_at: hoursAgo(38),
        note: "Paid by UPI, screenshot in the group",
      })
      .eq("id", rows[2].id);
  }
}

/**
 * What a pot household has instead of settlements: an agreed monthly amount per
 * member, and a reserve the house draws on. Both carry a decision id that is
 * `not null` on purpose.
 */
async function seedPot(context, periodId) {
  const { houseId, payerIds, memberIds, home, today } = context;

  const contributionDecision = await appliedDecision(houseId, memberIds[0], {
    type: "set_expected_contribution",
    level: "important",
    payload: { amount_paise: home.pot.monthlyContributionPaise },
    reason: "A fixed monthly amount into the pot, so nobody has to chase anybody.",
  });

  must(
    "insert member_expected_contributions",
    await admin
      .from("member_expected_contributions")
      .insert(
        payerIds.map((memberId) => ({
          house_id: houseId,
          member_id: memberId,
          amount_paise: home.pot.monthlyContributionPaise,
          effective_from: addDays(today, -60),
          decision_id: contributionDecision.id,
        })),
      )
      .select("id"),
  );

  const reserveDecision = await appliedDecision(houseId, memberIds[0], {
    type: "create_reserve",
    level: "critical",
    payload: { name: home.pot.reserve.name },
    reason: "The deposit and anything that breaks should not come out of a single month.",
  });

  const reserve = await insertOne("reserves", {
    house_id: houseId,
    name: home.pot.reserve.name,
    decision_id: reserveDecision.id,
    balance_paise: 0,
  });

  // The balance is maintained by a trigger on movements, so it is built up
  // rather than stated. BR-284: every contribution names its contributor, so
  // the opening float is attributed rather than appearing from nowhere.
  const movements = [
    { amount_paise: home.pot.reserve.openingPaise, member_id: payerIds[0], note: "Opening float from the deposit" },
    { amount_paise: 200_000, member_id: payerIds[1], note: "Monthly top-up" },
    { amount_paise: 200_000, member_id: payerIds[2 % payerIds.length], note: "Monthly top-up" },
  ];
  for (const movement of movements) {
    await insertOne("reserve_movements", {
      house_id: houseId,
      reserve_id: reserve.id,
      period_id: periodId,
      decision_id: reserveDecision.id,
      kind: "contribution",
      ...movement,
    });
  }

  // BR-285 and BR-287: a draw names both the cost it paid and the decision that
  // authorised it, so the expense has to exist first. It goes in the open
  // period — the closed one is immutable, which is the point of closing it.
  const drawDecision = await appliedDecision(houseId, memberIds[1], {
    type: "reserve_draw",
    level: "important",
    payload: { amount_paise: 340_000 },
    reason: "The geyser failed and the plumber wanted paying the same day.",
  });

  const repair = await logExpense(context, {
    period: periodOf(today),
    date: addDays(today, -6),
    category: "Household",
    description: "Geyser replacement — paid from the reserve",
    amountPaise: 340_000,
    payer: 0,
  });
  await admin.from("expenses").update({ reserve_id: reserve.id }).eq("id", repair.id);

  await insertOne("reserve_movements", {
    house_id: houseId,
    reserve_id: reserve.id,
    period_id: periodId,
    decision_id: drawDecision.id,
    expense_id: repair.id,
    kind: "draw",
    amount_paise: 340_000,
    note: "Geyser replacement",
  });
}
