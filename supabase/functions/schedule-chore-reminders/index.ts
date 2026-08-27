// Edge function: schedule-chore-reminders
//
// Runs at 05:00 house time (migration 042) and lays down the day's chore
// reminders — N-02 before each window opens, N-03 before each deadline — at the
// instant each member can actually act on them.
//
// This is the availability-aware timing of docs/11-NOTIFICATIONS-SPEC.md
// section 3.1, and it is the difference between a useful reminder and noise:
//
//   Suresh returns at 22:00. His evening chore's window is 22:00–23:00,
//   deadline 23:00. The naive reminder at 21:30 reaches him on the bus. The
//   rule moves it to 22:05.
//
// Only the *scheduling* happens here. The rows sit in `notifications` with a
// future `scheduled_for` and the dispatcher picks them up when they come due.
// That split is what lets this job run once a day while the timing stays
// minute-accurate.
//
// The reminder arithmetic mirrors lib/domain/notifications/timing.ts as a
// second copy, for the reason in DECISIONS.md D-06.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const REMINDER_LEAD_MIN = 30;
const SETTLE_IN_MIN = 5;
const DEADLINE_LEAD_MIN = 120;
const MINUTES_PER_DAY = 1440;

// ---------------------------------------------------------------------------
// Timezone arithmetic. India has no daylight saving, but a house elsewhere
// might, so the offset is read at the instant in question rather than assumed.
// ---------------------------------------------------------------------------

function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - at.getTime();
}

/** "2026-08-24" plus 1325 minutes, in the house's clock, as an instant. */
function zonedInstant(isoDate: string, minutes: number, timeZone: string): Date {
  const guess = Date.parse(`${isoDate}T00:00:00Z`) + minutes * 60_000;
  return new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
}

/** Minutes since local midnight of `isoDate`. May exceed 1440 past midnight. */
function localMinutesSince(isoDate: string, at: Date, timeZone: string): number {
  const midnight = zonedInstant(isoDate, 0, timeZone).getTime();
  return Math.round((at.getTime() - midnight) / 60_000);
}

function clockToMinutes(time: string | null): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function inQuietHours(minute: number, start: number | null, end: number | null): boolean {
  if (start === null || end === null || start === end) return false;
  const at = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return start < end ? at >= start && at < end : at >= start || at < end;
}

function nextAllowedMinute(minute: number, start: number | null, end: number | null): number {
  if (!inQuietHours(minute, start, end)) return minute;
  const day = Math.floor(minute / MINUTES_PER_DAY);
  const at = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if ((start as number) > (end as number) && at >= (start as number)) {
    return (day + 1) * MINUTES_PER_DAY + (end as number);
  }
  return day * MINUTES_PER_DAY + (end as number);
}

interface Availability {
  day_of_week: number;
  is_home: boolean;
  leaves_at: string | null;
  returns_at: string | null;
}

interface Exception {
  member_id: string;
  exc_date: string;
  exc_type: "away" | "home_all_day" | "custom_hours";
  returns_at: string | null;
}

interface Assignment {
  id: string;
  house_id: string;
  assignee_member_id: string;
  chore_date: string;
  window_start: string;
  deadline: string;
  effort_points: number;
  template_id: string;
}

function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function hhmm(minute: number): string {
  const at = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
}

Deno.serve(async () => {
  const { data: houses, error } = await supabase.from("houses").select("id, timezone");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const now = new Date();
  let scheduled = 0;
  let skipped = 0;

  for (const house of houses ?? []) {
    const timeZone = house.timezone ?? "Asia/Kolkata";
    const today = localDate(now, timeZone);

    const { data: assignments } = await supabase
      .from("chore_assignments")
      .select("id, house_id, assignee_member_id, chore_date, window_start, deadline, effort_points, template_id")
      .eq("house_id", house.id)
      .eq("chore_date", today)
      .in("status", ["assigned", "rejected"])
      .not("assignee_member_id", "is", null);

    if (!assignments || assignments.length === 0) continue;

    const memberIds = [...new Set(assignments.map((row: Assignment) => row.assignee_member_id))];
    const templateIds = [...new Set(assignments.map((row: Assignment) => row.template_id))];

    const [{ data: availability }, { data: exceptions }, { data: prefs }, { data: templates }] =
      await Promise.all([
        supabase
          .from("member_availability")
          .select("member_id, day_of_week, is_home, leaves_at, returns_at")
          .in("member_id", memberIds),
        supabase
          .from("availability_exceptions")
          .select("member_id, exc_date, exc_type, returns_at")
          .in("member_id", memberIds)
          .eq("exc_date", today),
        supabase
          .from("notification_prefs")
          .select("member_id, chore_reminders, quiet_hours_start, quiet_hours_end")
          .in("member_id", memberIds),
        supabase.from("chore_templates").select("id, name").in("id", templateIds),
      ]);

    const dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();
    const availabilityByMember = new Map<string, Availability>();
    for (const row of availability ?? []) {
      if (row.day_of_week === dayOfWeek) availabilityByMember.set(row.member_id, row);
    }
    const exceptionByMember = new Map<string, Exception>(
      (exceptions ?? []).map((row: Exception) => [row.member_id, row]),
    );
    const prefsByMember = new Map(
      (prefs ?? []).map((row: { member_id: string }) => [row.member_id, row]),
    );
    const nameByTemplate = new Map<string, string>(
      (templates ?? []).map((row: { id: string; name: string }) => [row.id, row.name]),
    );

    for (const assignment of assignments as Assignment[]) {
      const memberPrefs = prefsByMember.get(assignment.assignee_member_id) as
        | { chore_reminders: boolean; quiet_hours_start: string | null; quiet_hours_end: string | null }
        | undefined;

      // A member who has turned chore reminders off still gets the feed row
      // when something happens to the chore. A reminder is not an event, so
      // there is nothing to record and nothing to schedule.
      if (memberPrefs?.chore_reminders === false) {
        skipped += 1;
        continue;
      }

      const exception = exceptionByMember.get(assignment.assignee_member_id);
      if (exception?.exc_type === "away") {
        skipped += 1;
        continue;
      }

      const weekly = availabilityByMember.get(assignment.assignee_member_id);
      let returnsAtMin: number | null = null;
      if (exception?.exc_type === "custom_hours") {
        returnsAtMin = clockToMinutes(exception.returns_at);
      } else if (exception?.exc_type === "home_all_day") {
        returnsAtMin = null;
      } else if (weekly && weekly.is_home) {
        returnsAtMin = clockToMinutes(weekly.returns_at);
      }

      const quietStart = clockToMinutes(memberPrefs?.quiet_hours_start ?? null);
      const quietEnd = clockToMinutes(memberPrefs?.quiet_hours_end ?? null);

      const windowStartMin = localMinutesSince(
        assignment.chore_date,
        new Date(assignment.window_start),
        timeZone,
      );
      const deadlineMin = localMinutesSince(
        assignment.chore_date,
        new Date(assignment.deadline),
        timeZone,
      );

      let candidate = windowStartMin - REMINDER_LEAD_MIN;
      if (returnsAtMin !== null && candidate < returnsAtMin) {
        candidate = returnsAtMin + SETTLE_IN_MIN;
      }
      candidate = nextAllowedMinute(candidate, quietStart, quietEnd);
      if (candidate > deadlineMin) candidate = windowStartMin;

      const choreName = nameByTemplate.get(assignment.template_id) ?? "A chore";
      const windowEndMin = deadlineMin;

      const firstAt = zonedInstant(assignment.chore_date, candidate, timeZone);

      // Nothing is scheduled into the past: a job that runs at 05:00 has
      // already missed a 04:00 window, and a reminder that arrives after the
      // fact is worse than none.
      if (firstAt.getTime() > now.getTime()) {
        const { error: enqueueError } = await supabase.rpc("enqueue_notification", {
          p_house_id: assignment.house_id,
          p_member_id: assignment.assignee_member_id,
          p_type: "N-02",
          p_vars: {
            chore: choreName,
            time: hhmm(windowStartMin),
            points: String(assignment.effort_points),
            start: hhmm(windowStartMin),
            end: hhmm(windowEndMin),
          },
          p_tag: `chore-${assignment.id}`,
          p_payload: {
            assignment_id: assignment.id,
            window_start: assignment.window_start,
          },
          p_scheduled_for: firstAt.toISOString(),
        });
        if (!enqueueError) scheduled += 1;
      }

      // The second and last reminder for this chore (section 5 caps it at two).
      const secondMin = nextAllowedMinute(deadlineMin - DEADLINE_LEAD_MIN, quietStart, quietEnd);
      if (secondMin <= candidate || secondMin >= deadlineMin) continue;

      const secondAt = zonedInstant(assignment.chore_date, secondMin, timeZone);
      if (secondAt.getTime() <= now.getTime()) continue;

      const { error: secondError } = await supabase.rpc("enqueue_notification", {
        p_house_id: assignment.house_id,
        p_member_id: assignment.assignee_member_id,
        p_type: "N-03",
        p_vars: {
          chore: choreName,
          deadline: hhmm(deadlineMin),
          points: String(assignment.effort_points),
        },
        p_tag: `chore-deadline-${assignment.id}`,
        p_payload: {
          assignment_id: assignment.id,
          window_start: assignment.window_start,
        },
        p_scheduled_for: secondAt.toISOString(),
      });
      if (!secondError) scheduled += 1;
    }
  }

  return Response.json({ scheduled, skipped });
});
