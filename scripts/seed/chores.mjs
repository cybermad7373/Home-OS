/**
 * Two weeks of chores: the one behind, fully resolved, and the current one
 * caught mid-flight.
 *
 * The lifecycle is driven rather than stated. A chore is marked done, then
 * peers sign it, and the database's own triggers move it to confirmed and post
 * the effort points — which is why the leaderboard adds up instead of merely
 * looking like it does.
 */
import { admin, insertOne, must } from "./env.mjs";
import { PEOPLE } from "./profiles.mjs";
import { addDays, at, hoursAgo, weekDates, weekStartOf } from "./util.mjs";

const SLOT_WINDOW = {
  morning: ["06:00", "12:00"],
  evening: ["17:00", "23:00"],
  any: ["06:00", "23:00"],
};

/** One room-scoped chore per home, so the "whose room" branch is not theory. */
async function addRoomChore(context) {
  const { houseId, rooms } = context;
  return insertOne("chore_templates", {
    house_id: houseId,
    name: "Sweep the front room",
    category: "room_cleaning",
    effort_points: 10,
    duration_min: 15,
    slot: "morning",
    scope: "room",
    room_id: rooms[0],
    frequency: "times_per_week",
    times_per_week: 2,
  });
}

/** Which dates a template lands on within a week. */
function datesFor(template, dates) {
  if (template.frequency === "daily") return dates;
  if (template.frequency === "weekly") return [dates[2]];
  const count = Math.min(7, template.times_per_week ?? 1);
  return Array.from({ length: count }, (_, index) => dates[Math.round((index * 6) / Math.max(1, count - 1)) || 0]);
}

/**
 * Round-robin, skipping anybody who cannot cook when the chore needs one and
 * anybody who is not down for chores at all.
 */
function assignee(template, workers, turn) {
  for (let attempt = 0; attempt < workers.length; attempt += 1) {
    const candidate = workers[(turn + attempt) % workers.length];
    if (!template.requires_cooking_skill || candidate.canCook) {
      return { worker: candidate, nextTurn: (turn + attempt + 1) % workers.length };
    }
  }
  return { worker: workers[turn % workers.length], nextTurn: (turn + 1) % workers.length };
}

async function buildWeek(context, weekStart, workers, options) {
  const { houseId } = context;
  const dates = weekDates(weekStart);

  const templates = must(
    "select chore_templates",
    await admin.from("chore_templates").select("*").eq("house_id", houseId).eq("active", true),
  );

  const rows = [];
  let turn = options.turnOffset;
  for (const template of templates) {
    for (const date of datesFor(template, dates)) {
      const { worker, nextTurn } = assignee(template, workers, turn);
      turn = nextTurn;
      const [from, to] = SLOT_WINDOW[template.slot];
      rows.push({
        house_id: houseId,
        template_id: template.id,
        assignee_member_id: worker.id,
        chore_date: date,
        slot: template.slot,
        window_start: at(date, from),
        window_end: at(date, to),
        deadline: at(date, "23:59"),
        effort_points: template.effort_points,
        duration_min: template.duration_min,
        status: "assigned",
        source: options.source,
        confirmations_required: options.confirmationsRequired,
      });
    }
  }

  // Two nobody picked up. `open_has_no_assignee` insists an open chore has no
  // assignee, which is the point: open means available, not neglected.
  for (const row of rows.slice(-2)) {
    row.assignee_member_id = null;
    row.status = "open";
  }

  const run = await insertOne("schedule_runs", {
    house_id: houseId,
    week_start: weekStart,
    generator: options.source,
    llm_accepted: options.llmAccepted ?? null,
    llm_rationale: options.llmRationale ?? null,
    total_points: rows.reduce((sum, row) => sum + row.effort_points, 0),
    unassigned_count: rows.filter((row) => row.status === "open").length,
    max_deviation: options.maxDeviation,
    generated_at: options.generatedAt,
  });

  return must(
    "insert chore_assignments",
    await admin
      .from("chore_assignments")
      .insert(rows.map((row) => ({ ...row, schedule_run_id: run.id })))
      .select("id, assignee_member_id, chore_date, status, effort_points, confirmations_required"),
  );
}

/**
 * Mark done, then have peers sign it — the path a real chore takes.
 *
 * Two people cannot sign: the person who did it, and, when a dependent did it,
 * their guardian. D-24 exists because otherwise every piece of work routed
 * through a child would be marked and confirmed by the same adult in two taps.
 */
async function completeChore(context, assignment, confirmers, doneAt) {
  const { houseId, guardianOf } = context;
  await admin
    .from("chore_assignments")
    .update({ status: "done_pending", done_at: doneAt })
    .eq("id", assignment.id);

  const guardian = guardianOf.get(assignment.assignee_member_id);
  const peers = confirmers
    .filter((memberId) => memberId !== assignment.assignee_member_id && memberId !== guardian)
    .slice(0, Math.max(1, assignment.confirmations_required));

  if (peers.length === 0) return;

  for (const [index, memberId] of peers.entries()) {
    await insertOne("chore_confirmations", {
      house_id: houseId,
      assignment_id: assignment.id,
      member_id: memberId,
      is_lead: index === 0,
    });
  }
}

export async function seedChores(context) {
  const { houseId, home, today, memberIds, dependentIds, members } = context;

  await addRoomChore(context);

  // Dependents do chores in the family home; nobody else has any. A child is
  // never given the cooking, which is what `canCook: false` buys here.
  const workers = [
    ...home.roster.map((entry, index) => ({
      id: memberIds[index],
      canCook: PEOPLE[entry.username].canCook,
    })),
    ...dependentIds.map((id) => ({ id, canCook: false })),
  ];

  const confirmationsRequired = { size_aware: memberIds.length >= 6 ? 2 : 1, single: 1, off: 1 }[
    home.settings.confirmation_policy
  ];

  const thisWeek = weekStartOf(today);
  const lastWeek = addDays(thisWeek, -7);

  // ------------------------------------------------------------- last week
  // Generated by the model rather than the engine, so the schedule history
  // screen has both generators on it and a rationale to show.
  const previous = await buildWeek(context, lastWeek, workers, {
    source: "llm",
    llmAccepted: true,
    llmRationale:
      "Cooking spread across the four who cook, heavy jobs kept off the two who were away midweek, and nobody given two evening slots in a row.",
    turnOffset: 0,
    confirmationsRequired,
    maxDeviation: 14,
    generatedAt: hoursAgo(24 * 9),
  });

  for (const [index, assignment] of previous.entries()) {
    if (assignment.status === "open") continue;
    if (index % 7 === 5) {
      await admin.from("chore_assignments").update({ status: "missed" }).eq("id", assignment.id);
      continue;
    }
    if (index % 11 === 9) {
      const rejecter = memberIds.find((id) => id !== assignment.assignee_member_id);
      await admin
        .from("chore_assignments")
        .update({
          status: "rejected",
          done_at: at(assignment.chore_date, "20:00"),
          rejected_by: rejecter,
          rejected_reason: "The floor was still sticky by the door.",
          retry_count: 1,
        })
        .eq("id", assignment.id);
      continue;
    }
    await completeChore(context, assignment, memberIds, at(assignment.chore_date, "20:30"));
  }

  // ------------------------------------------------------------- this week
  const current = await buildWeek(context, thisWeek, workers, {
    source: "engine",
    turnOffset: 3,
    confirmationsRequired,
    maxDeviation: 9,
    generatedAt: hoursAgo(24 * 2),
  });

  const demoMemberId = members.get("demo");
  let leftWaiting = false;

  for (const [index, assignment] of current.entries()) {
    if (assignment.status === "open") continue;
    if (assignment.chore_date > today) continue;

    // One chore left sitting in done_pending with `demo` as a peer who has not
    // signed it, so "waiting on you" on Home and Today is a real number.
    if (!leftWaiting && assignment.assignee_member_id !== demoMemberId && assignment.chore_date < today) {
      await admin
        .from("chore_assignments")
        .update({ status: "done_pending", done_at: hoursAgo(14) })
        .eq("id", assignment.id);
      leftWaiting = true;
      continue;
    }

    if (assignment.chore_date === today) continue; // still to do
    if (index % 6 === 4) {
      await admin.from("chore_assignments").update({ status: "missed" }).eq("id", assignment.id);
      continue;
    }
    await completeChore(context, assignment, memberIds, at(assignment.chore_date, "20:30"));
  }

  // ----------------------------------------------------------------- swaps
  const swappable = current.filter(
    (row) => row.status === "assigned" && row.chore_date >= today && row.assignee_member_id,
  );
  if (swappable[0] && memberIds.length > 1) {
    const to = memberIds.find((id) => id !== swappable[0].assignee_member_id);
    await insertOne("swap_requests", {
      house_id: houseId,
      assignment_id: swappable[0].id,
      from_member_id: swappable[0].assignee_member_id,
      to_member_id: to,
      status: "pending",
      message: "I am on a late shift on Thursday — can you take this one?",
    });
  }
  if (swappable[1]) {
    const to = memberIds.find((id) => id !== swappable[1].assignee_member_id);
    await insertOne("swap_requests", {
      house_id: houseId,
      assignment_id: swappable[1].id,
      from_member_id: swappable[1].assignee_member_id,
      to_member_id: to,
      status: "declined",
      message: "Swap for Friday?",
      responded_at: hoursAgo(6),
    });
  }

  // --------------------------------------------------------- effort ledger
  // The confirmations above post points for both weeks through
  // `post_effort_points`; what that trigger cannot know is what the target was.
  // A rota household is not scored at all, so it gets no targets rather than
  // zeroes it would then be judged against.
  if (home.settings.effort_mode !== "points") return;

  const target = 260;
  for (const weekStart of [lastWeek, thisWeek]) {
    const existing = must(
      "select effort_ledger",
      await admin
        .from("effort_ledger")
        .select("member_id, earned_points")
        .eq("house_id", houseId)
        .eq("week_start", weekStart),
    );
    const earned = new Map(existing.map((row) => [row.member_id, row.earned_points]));

    must(
      "upsert effort_ledger",
      await admin
        .from("effort_ledger")
        .upsert(
          [...memberIds, ...dependentIds].map((memberId) => {
            const points = earned.get(memberId) ?? 0;
            return {
              house_id: houseId,
              member_id: memberId,
              week_start: weekStart,
              base_target: target,
              effective_target: target,
              earned_points: points,
              carry_out: points - target,
              present_days: 7,
            };
          }),
          { onConflict: "house_id,member_id,week_start" },
        )
        .select("id"),
    );
  }
}
