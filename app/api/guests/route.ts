import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { createGuest, findOverlappingGuest, listGuests } from "@/lib/data/guests";
import { addGuestChores } from "@/lib/data/chores";
import { guestDatesInRange, guestSchema } from "@/lib/validation/availability";
import { houseToday } from "@/lib/utils/date";

/** GET /api/guests?from=&to= — who is staying, and whose responsibility they are. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);

  const params = new URL(request.url).searchParams;
  const today = houseToday(house.timezone);
  const from = params.get("from") ?? today;
  const to = params.get("to") ?? addDays(today, 28);

  return jsonResponse({ guests: await listGuests(session, house.id, { from, to }) });
});

/**
 * POST /api/guests — register a guest against yourself.
 *
 * The host is always the caller. An admin registering a guest to somebody else
 * would be an admin deciding who somebody else is responsible for, and the
 * expense share that follows would be theirs to argue with rather than the
 * host's to own.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const input = await parseBody(request, guestSchema);
  const today = houseToday(house.timezone);

  // BR: a week of hindsight, no more. Past that it stops being a correction and
  // becomes a way to revisit a split after seeing it.
  if (!guestDatesInRange(input, today)) {
    throw new ApiError("GUEST_DATES_PAST");
  }

  // The same name over the same nights is a double registration, and a double
  // registration is a double head in somebody's expense share.
  const clash = await findOverlappingGuest(session, house.id, input);
  if (clash) throw new ApiError("GUEST_ALREADY_REGISTERED");

  const guest = await createGuest(session, house.id, member.id, input);

  // E-17 — a guest registered against a week that is already published still
  // creates work. Only the nights that have not happened yet produce it.
  const chores = guest.isAssignable
    ? await addGuestChores(session, house.id, guest, today)
    : { added: [], skipped: [] };

  return jsonResponse({ ...guest, chores }, 201);
});

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
