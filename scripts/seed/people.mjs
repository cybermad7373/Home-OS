/**
 * When people are around, and who else is in the house.
 *
 * The scheduler reads all of this — a member who is out on Tuesday evening
 * should not be given Tuesday's cooking — so an empty availability table is not
 * a cosmetic gap. It is the reason a demo schedule looks arbitrary.
 */
import { admin, insertOne, must } from "./env.mjs";
import { addDays, at } from "./util.mjs";

/**
 * A working week, varied per person so the availability grid is worth looking
 * at. Index into the roster, so each home gets its own rhythm.
 */
const PATTERNS = [
  { label: "office hours", weekday: ["09:30", "19:00"], weekend: null },
  { label: "long days", weekday: ["08:00", "20:30"], weekend: null },
  { label: "night shift", weekday: ["21:00", "07:00"], weekend: null, invert: true },
  { label: "works from home", weekday: null, weekend: null },
  { label: "college", weekday: ["08:30", "16:00"], weekend: null },
];

export async function seedAvailability(houseId, memberIds, today) {
  const rows = [];

  for (const [index, memberId] of memberIds.entries()) {
    const pattern = PATTERNS[index % PATTERNS.length];

    for (let day = 0; day <= 6; day += 1) {
      const isWeekend = day === 0 || day === 6;
      const window = isWeekend ? pattern.weekend : pattern.weekday;

      // A night-shift worker is out overnight, which the database models as
      // "not home" rather than a window that wraps midnight.
      if (pattern.invert && !isWeekend) {
        rows.push({ house_id: houseId, member_id: memberId, day_of_week: day, is_home: false });
        continue;
      }

      rows.push({
        house_id: houseId,
        member_id: memberId,
        day_of_week: day,
        is_home: true,
        leaves_at: window ? window[0] : null,
        returns_at: window ? window[1] : null,
      });
    }
  }

  must(
    "upsert member_availability",
    await admin
      .from("member_availability")
      .upsert(rows, { onConflict: "member_id,day_of_week" })
      .select("id"),
  );

  // One-off changes to that week: a day away, a day at home, a late return.
  // These are what the scheduler actually reacts to, and what the "my week"
  // screen exists to let somebody enter.
  const exceptions = [
    { member: 0, offset: 2, exc_type: "home_all_day", reason: "Working from home" },
    { member: 1, offset: 3, exc_type: "away", reason: "Client visit in Coimbatore" },
    {
      member: 2 % memberIds.length,
      offset: 4,
      exc_type: "custom_hours",
      leaves_at: "07:00",
      returns_at: "22:30",
      reason: "Early start, late finish",
    },
  ];

  for (const exception of exceptions) {
    const memberId = memberIds[exception.member % memberIds.length];
    await insertOne("availability_exceptions", {
      house_id: houseId,
      member_id: memberId,
      exc_date: addDays(today, exception.offset),
      exc_type: exception.exc_type,
      leaves_at: exception.leaves_at ?? null,
      returns_at: exception.returns_at ?? null,
      reason: exception.reason,
    });
  }
}

/**
 * Guests. Two states worth showing: somebody staying right now who counts for
 * the food bill and takes a turn at the chores, and somebody who came for a
 * weekend and did neither.
 */
export async function seedGuests(houseId, memberIds, today) {
  const staying = await insertOne("guests", {
    house_id: houseId,
    host_member_id: memberIds[1 % memberIds.length],
    name: "Bharath (Kumar's brother)",
    from_date: addDays(today, -3),
    to_date: addDays(today, 4),
    counts_for_expense: true,
    is_assignable: true,
  });

  await insertOne("guests", {
    house_id: houseId,
    host_member_id: memberIds[0],
    name: "Anitha (weekend visit)",
    from_date: addDays(today, -12),
    to_date: addDays(today, -10),
    counts_for_expense: false,
    is_assignable: false,
  });

  return staying.id;
}

/**
 * Away days. One approved and in the past, one waiting on a lead right now —
 * the waiting one is what puts a row in the approvals queue.
 *
 * `absence_decided_matches_status` ties `decided_at` to the status, and
 * `absence_no_overlap` refuses two absences over the same days for one person,
 * so these are spread across different members.
 */
export async function seedAbsences(houseId, memberIds, today) {
  await insertOne("absence_requests", {
    house_id: houseId,
    member_id: memberIds[2 % memberIds.length],
    from_date: addDays(today, -20),
    to_date: addDays(today, -16),
    reason: "Home for a family function",
    status: "approved",
    decided_at: at(addDays(today, -22), "09:00"),
  });

  const waiting = await insertOne("absence_requests", {
    house_id: houseId,
    member_id: memberIds[3 % memberIds.length],
    from_date: addDays(today, 9),
    to_date: addDays(today, 13),
    reason: "Cousin's wedding in Madurai",
    status: "waiting",
  });

  await insertOne("absence_requests", {
    house_id: houseId,
    member_id: memberIds[1 % memberIds.length],
    from_date: addDays(today, -45),
    to_date: addDays(today, -43),
    reason: "Interview travel",
    status: "rejected",
    decided_at: at(addDays(today, -47), "18:00"),
  });

  return waiting.id;
}

/**
 * Announcements. One ordinary, one that matters, one that is nearly out of
 * time — the severity ladder the board is meant to show.
 */
export async function seedAnnouncements(houseId, memberIds, today) {
  void today;
  const now = Date.now();
  const inDays = (days) => new Date(now + days * 86_400_000).toISOString();

  must(
    "insert house_announcements",
    await admin
      .from("house_announcements")
      .insert([
        {
          house_id: houseId,
          author_member_id: memberIds[0],
          title: "Water tanker on Saturday morning",
          body: "The tanker comes between 7 and 9. Please do not park in front of the gate, and keep the terrace door unlocked so they can reach the tank.",
          severity: "info",
          expires_at: inDays(6),
        },
        {
          house_id: houseId,
          author_member_id: memberIds[1 % memberIds.length],
          title: "Electricity bill is up 40% this month",
          body: "Before anyone blames the geyser: the meter reading is on the board. If the pattern holds next month we should get the wiring looked at rather than argue about it again.",
          severity: "important",
          expires_at: inDays(14),
        },
        {
          house_id: houseId,
          author_member_id: memberIds[0],
          title: "Gas cylinder is nearly empty",
          body: "The spare is empty too. Whoever is out today, please book a refill — nobody can cook tomorrow otherwise.",
          severity: "urgent",
          expires_at: inDays(2),
        },
      ])
      .select("id"),
  );
}
