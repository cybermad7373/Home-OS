// Edge function: close-effort-week
//
// Runs Sunday evening, before the next week is generated. For every active
// member it writes the effort_ledger row for the week just ending:
//
//   carry_out = earned_points − effective_target
//
// That number is what follows somebody into next week as a higher or lower
// target, and its running sum over a month is what the penalty is computed
// from. It is the hinge between "did the work" and "owes money for not doing
// it", which is why it gets its own job rather than being a side effect of
// generation.
//
// Idempotent: the row is upserted, and earned_points is recomputed from the
// confirmed assignments rather than accumulated, so a second run produces the
// same row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** The Monday on or before a date. */
function weekStartOf(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const isoDayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (isoDayOfWeek - 1));
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

Deno.serve(async (request) => {
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // An explicit week can be passed in for a catch-up run.
  let requestedWeek: string | null = null;
  try {
    const body = await request.json();
    requestedWeek = typeof body?.week_start === "string" ? body.week_start : null;
  } catch {
    // No body is the normal case, from cron.
  }

  const { data: houses, error: housesError } = await supabase
    .from("houses")
    .select("id, timezone");

  if (housesError) {
    return Response.json({ error: housesError.message }, { status: 500 });
  }

  const closed: { house_id: string; week_start: string; members: number }[] = [];

  for (const house of houses ?? []) {
    // The week that is ending: the one before the current one.
    const weekStart =
      requestedWeek ?? addDays(weekStartOf(todayIn(house.timezone)), -7);
    const weekEnd = addDays(weekStart, 6);

    const [{ data: members }, { data: assignments }, { data: existing }] =
      await Promise.all([
        supabase
          .from("house_members")
          .select("id")
          .eq("house_id", house.id)
          .eq("status", "active"),
        supabase
          .from("chore_assignments")
          .select("assignee_member_id, effort_points, status")
          .eq("house_id", house.id)
          .gte("chore_date", weekStart)
          .lte("chore_date", weekEnd),
        supabase
          .from("effort_ledger")
          .select("member_id, effective_target")
          .eq("house_id", house.id)
          .eq("week_start", weekStart),
      ]);

    if (!members || members.length === 0) continue;

    const targetByMember = new Map(
      (existing ?? []).map((row) => [row.member_id, row.effective_target]),
    );

    const earned = new Map<string, number>();
    const confirmedCount = new Map<string, number>();
    const missedCount = new Map<string, number>();
    const assignedCount = new Map<string, number>();

    for (const assignment of assignments ?? []) {
      const memberId = assignment.assignee_member_id;
      if (!memberId) continue;

      assignedCount.set(memberId, (assignedCount.get(memberId) ?? 0) + 1);

      if (assignment.status === "confirmed") {
        earned.set(memberId, (earned.get(memberId) ?? 0) + assignment.effort_points);
        confirmedCount.set(memberId, (confirmedCount.get(memberId) ?? 0) + 1);
      }
      if (assignment.status === "missed") {
        missedCount.set(memberId, (missedCount.get(memberId) ?? 0) + 1);
      }
    }

    const rows = members.map((member) => {
      const earnedPoints = earned.get(member.id) ?? 0;
      // Without a stored target — a week nobody generated — the target is what
      // they were actually assigned, so an ungenerated week costs nobody.
      const effectiveTarget = targetByMember.get(member.id) ?? earnedPoints;

      return {
        house_id: house.id,
        member_id: member.id,
        week_start: weekStart,
        effective_target: effectiveTarget,
        earned_points: earnedPoints,
        carry_out: earnedPoints - effectiveTarget,
        assigned_count: assignedCount.get(member.id) ?? 0,
        confirmed_count: confirmedCount.get(member.id) ?? 0,
        missed_count: missedCount.get(member.id) ?? 0,
        closed_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from("effort_ledger")
      .upsert(rows, { onConflict: "house_id,member_id,week_start" });

    if (!error) {
      closed.push({ house_id: house.id, week_start: weekStart, members: rows.length });
    }
  }

  return Response.json({ closed });
});
