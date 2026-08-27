import "server-only";

import { apiErrorFromPostgres } from "@/lib/api/errors";
import type { Session } from "./house";
import type { GuestRow } from "@/lib/types/database";
import type { GuestInput } from "@/lib/validation/availability";

/**
 * The guest repository.
 *
 * A guest is not a user and never becomes one. They exist for two reasons, both
 * of which are about the host rather than the visitor:
 *
 *   - they eat, so they count in the head count for a shared expense on the
 *     days they are here (EX-06);
 *   - they make mess, so their host can be given the extra work that creates.
 *
 * Both consequences land on the host. That is the whole design: a member whose
 * friend stays for the weekend does not get to externalise the cost of that
 * weekend onto the house.
 */

export interface GuestView {
  id: string;
  name: string;
  hostMemberId: string;
  hostName: string;
  fromDate: string;
  toDate: string;
  countsForExpense: boolean;
  isAssignable: boolean;
}

type GuestJoinRow = GuestRow & {
  host: { id: string; users: { display_name: string } | null } | null;
};

const GUEST_SELECT = `
  *,
  host:house_members!guests_host_member_id_fkey ( id, users ( display_name ) )
`;

function toGuestView(row: GuestJoinRow): GuestView {
  return {
    id: row.id,
    name: row.name,
    hostMemberId: row.host_member_id,
    hostName: row.host?.users?.display_name ?? "Someone",
    fromDate: row.from_date,
    toDate: row.to_date,
    countsForExpense: row.counts_for_expense,
    isAssignable: row.is_assignable,
  };
}

/** Guests whose stay overlaps a range. Everybody in the house can see them. */
export async function listGuests(
  session: Session,
  houseId: string,
  range: { from: string; to: string },
): Promise<GuestView[]> {
  const { data, error } = await session.supabase
    .from("guests")
    .select(GUEST_SELECT)
    .eq("house_id", houseId)
    // Overlap, not containment: a guest who arrived last week and leaves next
    // week is here today, and a containment test would miss them entirely.
    .lte("from_date", range.to)
    .gte("to_date", range.from)
    .order("from_date");

  if (error) throw apiErrorFromPostgres(error);
  return (data as unknown as GuestJoinRow[]).map(toGuestView);
}

export async function getGuest(
  session: Session,
  houseId: string,
  guestId: string,
): Promise<GuestView | null> {
  const { data, error } = await session.supabase
    .from("guests")
    .select(GUEST_SELECT)
    .eq("house_id", houseId)
    .eq("id", guestId)
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  return data ? toGuestView(data as unknown as GuestJoinRow) : null;
}

/**
 * The same guest, already registered over overlapping nights.
 *
 * Matched on name, case-insensitively, because the failure this prevents is
 * somebody registering "Arjun" twice for the same weekend and being billed two
 * heads for one visitor. It is not an identity check — two different Arjuns
 * staying the same weekend is a real situation, and the host resolves it by
 * distinguishing the names.
 */
export async function findOverlappingGuest(
  session: Session,
  houseId: string,
  input: { name: string; from_date: string; to_date: string },
): Promise<GuestView | null> {
  const { data, error } = await session.supabase
    .from("guests")
    .select(GUEST_SELECT)
    .eq("house_id", houseId)
    .ilike("name", input.name)
    .lte("from_date", input.to_date)
    .gte("to_date", input.from_date)
    .limit(1);

  if (error) throw apiErrorFromPostgres(error);
  const rows = data as unknown as GuestJoinRow[];
  return rows.length > 0 ? toGuestView(rows[0]) : null;
}

/** The host registers their own guest; RLS enforces that, and so does this. */
export async function createGuest(
  session: Session,
  houseId: string,
  hostMemberId: string,
  input: GuestInput,
): Promise<GuestView> {
  const { data, error } = await session.supabase
    .from("guests")
    .insert({
      house_id: houseId,
      host_member_id: hostMemberId,
      name: input.name,
      from_date: input.from_date,
      to_date: input.to_date,
      counts_for_expense: input.counts_for_expense,
      is_assignable: input.is_assignable,
    })
    .select(GUEST_SELECT)
    .single();

  if (error) throw apiErrorFromPostgres(error);
  return toGuestView(data as unknown as GuestJoinRow);
}

export async function deleteGuest(
  session: Session,
  houseId: string,
  guestId: string,
): Promise<void> {
  const { error } = await session.supabase
    .from("guests")
    .delete()
    .eq("house_id", houseId)
    .eq("id", guestId);

  if (error) throw apiErrorFromPostgres(error);
}

/**
 * Guest head count per member, on one date — the figure an equal split adds to
 * each host's share (EX-06).
 *
 * Only guests flagged `counts_for_expense` appear. A guest who was here for an
 * afternoon and ate nothing is a real case, and forcing their host to pay a
 * day's food for them would simply make hosts stop registering guests, which
 * costs the house the head count entirely.
 */
export async function guestCountByHost(
  session: Session,
  houseId: string,
  date: string,
): Promise<Map<string, number>> {
  const { data, error } = await session.supabase
    .from("guests")
    .select("host_member_id")
    .eq("house_id", houseId)
    .eq("counts_for_expense", true)
    .lte("from_date", date)
    .gte("to_date", date);

  if (error) throw apiErrorFromPostgres(error);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.host_member_id, (counts.get(row.host_member_id) ?? 0) + 1);
  }
  return counts;
}
