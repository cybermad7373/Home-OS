/**
 * Dates, money and small deterministic helpers.
 *
 * Two rules the rest of the seed depends on, both of them the app's own:
 * money is integer paise everywhere, and a date is evaluated in the house
 * timezone rather than the machine's.
 */

/** Today, in a house's timezone, as `YYYY-MM-DD`. */
export function todayIn(timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The Monday on or before a date — the app's week start, everywhere. */
export function weekStartOf(date) {
  const value = new Date(`${date}T12:00:00Z`);
  const isoDayOfWeek = value.getUTCDay() === 0 ? 7 : value.getUTCDay();
  value.setUTCDate(value.getUTCDate() - (isoDayOfWeek - 1));
  return value.toISOString().slice(0, 10);
}

export function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset));
}

/** 0 = Sunday, matching `member_availability.day_of_week`. */
export function dayOfWeek(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function periodOf(date) {
  return date.slice(0, 7);
}

export function previousPeriod(period) {
  const [year, month] = period.split("-").map(Number);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/** A timestamp on a given date, in UTC, so ordering in the UI is stable. */
export function at(date, time = "12:00") {
  return `${date}T${time}:00Z`;
}

export function daysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function hoursAgo(hours) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/**
 * Equal split with the remainder handed out one paisa at a time, ordered by
 * member id. The database asserts that the shares sum to the expense, so this
 * has to be exact rather than nearly right.
 */
export function splitEqual(amountPaise, memberIds) {
  const ids = [...memberIds].sort();
  const base = Math.floor(amountPaise / ids.length);
  const remainder = amountPaise - base * ids.length;
  return ids.map((id, index) => ({
    member_id: id,
    share_paise: base + (index < remainder ? 1 : 0),
  }));
}

/**
 * A tiny deterministic generator. The demo has to look the same every time it
 * is rebuilt, so nothing here uses Math.random.
 */
export function sequence(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

export function pick(array, index) {
  return array[index % array.length];
}

/** Greedy debtor-to-creditor matching — the same shape the app settles with. */
export function transfers(balances) {
  const debtors = balances
    .filter((row) => row.final_net_paise < 0)
    .map((row) => ({ id: row.member_id, amount: -row.final_net_paise }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  const creditors = balances
    .filter((row) => row.final_net_paise > 0)
    .map((row) => ({ id: row.member_id, amount: row.final_net_paise }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const payments = [];
  let debtor = 0;
  let creditor = 0;
  while (debtor < debtors.length && creditor < creditors.length) {
    const amount = Math.min(debtors[debtor].amount, creditors[creditor].amount);
    if (amount > 0) {
      payments.push({
        from_member_id: debtors[debtor].id,
        to_member_id: creditors[creditor].id,
        amount_paise: amount,
      });
    }
    debtors[debtor].amount -= amount;
    creditors[creditor].amount -= amount;
    if (debtors[debtor].amount === 0) debtor += 1;
    if (creditors[creditor].amount === 0) creditor += 1;
  }
  return payments;
}
