import "server-only";

import { apiErrorFromPostgres } from "@/lib/api/errors";
import {
  timeToMinutes,
  windowsForDate,
  type AvailabilityException,
  type DayAvailability,
} from "@/lib/domain/scheduling/capacity";
import type { Session } from "./house";
import type {
  AvailabilityExceptionRow,
  MemberAvailabilityRow,
} from "@/lib/types/database";
import type {
  AvailabilityDayInput,
  AvailabilityExceptionInput,
} from "@/lib/validation/availability";

/**
 * The availability repository.
 *
 * Reads and writes the seven-day pattern and its date exceptions, and converts
 * both into the shape the scheduling engine wants. No window arithmetic happens
 * here — that lives in lib/domain/scheduling/capacity.ts and is tested without
 * a database.
 */

export interface AvailabilityDayView {
  dayOfWeek: number;
  isHome: boolean;
  /** "09:30", or null for home from the start of the day. */
  leavesAt: string | null;
  returnsAt: string | null;
}

/** Postgres hands back "09:30:00"; the form wants "09:30". */
function trimSeconds(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

/**
 * The pattern as recorded, or seven home-all-day rows where nothing is.
 *
 * BR-020: a member with no pattern is treated as home all day, and prompted to
 * correct it. Assuming they are out would quietly excuse them from work, which
 * is the failure this product exists to prevent.
 */
export async function getAvailability(
  session: Session,
  houseId: string,
  memberId: string,
): Promise<AvailabilityDayView[]> {
  const { data, error } = await session.supabase
    .from("member_availability")
    .select("*")
    .eq("house_id", houseId)
    .eq("member_id", memberId)
    .order("day_of_week");

  if (error) throw apiErrorFromPostgres(error);

  const byDay = new Map(
    (data ?? []).map((row: MemberAvailabilityRow) => [row.day_of_week, row]),
  );

  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const row = byDay.get(dayOfWeek);
    return {
      dayOfWeek,
      isHome: row?.is_home ?? true,
      leavesAt: trimSeconds(row?.leaves_at ?? null),
      returnsAt: trimSeconds(row?.returns_at ?? null),
    };
  });
}

/** Has this member ever recorded a pattern? Drives the onboarding prompt. */
export async function hasAvailability(
  session: Session,
  houseId: string,
  memberId: string,
): Promise<boolean> {
  const { count, error } = await session.supabase
    .from("member_availability")
    .select("id", { count: "exact", head: true })
    .eq("house_id", houseId)
    .eq("member_id", memberId);

  if (error) throw apiErrorFromPostgres(error);
  return (count ?? 0) > 0;
}

/**
 * Replaces the whole week in one write.
 *
 * All seven days go together because a half-submitted pattern is worse than
 * none: the missing days silently become home-all-day, and the member believes
 * they told the house otherwise.
 */
export async function saveAvailability(
  session: Session,
  houseId: string,
  memberId: string,
  days: AvailabilityDayInput[],
): Promise<AvailabilityDayView[]> {
  const rows = days.map((day) => ({
    house_id: houseId,
    member_id: memberId,
    day_of_week: day.day_of_week,
    is_home: day.is_home,
    // An away day carries no times. Keeping them would leave a stale window
    // behind the moment the day is switched back to home.
    leaves_at: day.is_home ? (day.leaves_at ?? null) : null,
    returns_at: day.is_home ? (day.returns_at ?? null) : null,
  }));

  const { error } = await session.supabase
    .from("member_availability")
    .upsert(rows, { onConflict: "member_id,day_of_week" });

  if (error) throw apiErrorFromPostgres(error);
  return getAvailability(session, houseId, memberId);
}

export interface ExceptionView {
  id: string;
  memberId: string;
  date: string;
  type: AvailabilityExceptionRow["exc_type"];
  leavesAt: string | null;
  returnsAt: string | null;
  reason: string | null;
}

function toExceptionView(row: AvailabilityExceptionRow): ExceptionView {
  return {
    id: row.id,
    memberId: row.member_id,
    date: row.exc_date,
    type: row.exc_type,
    leavesAt: trimSeconds(row.leaves_at),
    returnsAt: trimSeconds(row.returns_at),
    reason: row.reason,
  };
}

/**
 * Exceptions in a date range, for the whole house or for one member.
 *
 * The house-wide read is not a courtesy: everybody can see when everybody else
 * is home, because that is the evidence behind every assignment, and a schedule
 * whose inputs nobody can check is only an assertion.
 */
export async function listExceptions(
  session: Session,
  houseId: string,
  range: { from: string; to: string },
  memberId?: string,
): Promise<ExceptionView[]> {
  let query = session.supabase
    .from("availability_exceptions")
    .select("*")
    .eq("house_id", houseId)
    .gte("exc_date", range.from)
    .lte("exc_date", range.to)
    .order("exc_date");

  if (memberId) query = query.eq("member_id", memberId);

  const { data, error } = await query;
  if (error) throw apiErrorFromPostgres(error);
  return ((data ?? []) as AvailabilityExceptionRow[]).map(toExceptionView);
}

export async function getException(
  session: Session,
  houseId: string,
  exceptionId: string,
): Promise<ExceptionView | null> {
  const { data, error } = await session.supabase
    .from("availability_exceptions")
    .select("*")
    .eq("house_id", houseId)
    .eq("id", exceptionId)
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  return data ? toExceptionView(data as AvailabilityExceptionRow) : null;
}

/** One exception per member per date; declaring twice overwrites. */
export async function saveException(
  session: Session,
  houseId: string,
  memberId: string,
  input: AvailabilityExceptionInput,
): Promise<ExceptionView> {
  const carriesTimes = input.exc_type === "custom_hours";

  const { data, error } = await session.supabase
    .from("availability_exceptions")
    .upsert(
      {
        house_id: houseId,
        member_id: memberId,
        exc_date: input.exc_date,
        exc_type: input.exc_type,
        leaves_at: carriesTimes ? (input.leaves_at ?? null) : null,
        returns_at: carriesTimes ? (input.returns_at ?? null) : null,
        reason: input.reason ?? null,
      },
      { onConflict: "member_id,exc_date" },
    )
    .select("*")
    .single();

  if (error) throw apiErrorFromPostgres(error);
  return toExceptionView(data as AvailabilityExceptionRow);
}

export async function deleteException(
  session: Session,
  houseId: string,
  exceptionId: string,
): Promise<void> {
  const { error } = await session.supabase
    .from("availability_exceptions")
    .delete()
    .eq("house_id", houseId)
    .eq("id", exceptionId);

  if (error) throw apiErrorFromPostgres(error);
}

// ---------------------------------------------------------------------------
// Handing it to the engine
// ---------------------------------------------------------------------------

/**
 * The whole house's patterns, keyed by member, in the engine's vocabulary.
 *
 * A member with no rows is absent from the map, and `buildWeekWindows` called
 * with an empty list yields a full day everywhere — BR-020 again, expressed by
 * omission rather than by a special case.
 */
export async function getHouseAvailability(
  session: Session,
  houseId: string,
): Promise<Map<string, DayAvailability[]>> {
  const { data, error } = await session.supabase
    .from("member_availability")
    .select("member_id, day_of_week, is_home, leaves_at, returns_at")
    .eq("house_id", houseId);

  if (error) throw apiErrorFromPostgres(error);

  const byMember = new Map<string, DayAvailability[]>();
  for (const row of (data ?? []) as MemberAvailabilityRow[]) {
    const days = byMember.get(row.member_id) ?? [];
    days.push({
      dayOfWeek: row.day_of_week,
      isHome: row.is_home,
      leavesAtMin: timeToMinutes(trimSeconds(row.leaves_at)),
      returnsAtMin: timeToMinutes(trimSeconds(row.returns_at)),
    });
    byMember.set(row.member_id, days);
  }

  return byMember;
}

/** The same, for exceptions across a week. */
export async function getHouseExceptions(
  session: Session,
  houseId: string,
  range: { from: string; to: string },
): Promise<Map<string, AvailabilityException[]>> {
  const rows = await listExceptions(session, houseId, range);

  const byMember = new Map<string, AvailabilityException[]>();
  for (const row of rows) {
    const list = byMember.get(row.memberId) ?? [];
    list.push({
      date: row.date,
      type: row.type,
      leavesAtMin: timeToMinutes(row.leavesAt),
      returnsAtMin: timeToMinutes(row.returnsAt),
    });
    byMember.set(row.memberId, list);
  }

  return byMember;
}

// ---------------------------------------------------------------------------
// The preview
// ---------------------------------------------------------------------------

export interface DerivedWindow {
  dayOfWeek: number;
  label: string;
  windows: { kind: string; from: string; to: string }[];
  freeMinutes: number;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * What the house will actually be able to ask of somebody, from what they just
 * typed.
 *
 * Shown live while the pattern is being filled in, because "I'm out 9 to 7" and
 * "you can be given a 45-minute job before 9 or after 7" are not obviously the
 * same statement, and the second is the one the schedule acts on. A member who
 * sees an empty Tuesday here corrects their times; one who never sees it
 * discovers the problem when a chore lands.
 */
export function deriveWindows(days: AvailabilityDayView[]): DerivedWindow[] {
  return days.map((day) => {
    // A date is needed only to satisfy the signature; nothing about the derived
    // windows depends on which week it falls in.
    const windows = windowsForDate("2026-01-01", {
      dayOfWeek: day.dayOfWeek,
      isHome: day.isHome,
      leavesAtMin: timeToMinutes(day.leavesAt),
      returnsAtMin: timeToMinutes(day.returnsAt),
    });

    return {
      dayOfWeek: day.dayOfWeek,
      label: DAY_LABELS[day.dayOfWeek],
      windows: windows.map((window) => ({
        kind: window.kind,
        from: formatMinutes(window.startMin),
        to: formatMinutes(window.endMin),
      })),
      freeMinutes: windows.reduce(
        (sum, window) => sum + (window.endMin - window.startMin),
        0,
      ),
    };
  });
}
