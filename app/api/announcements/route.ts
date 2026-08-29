import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireLeadMembership, requireSession } from "@/lib/data/house";
import { createAnnouncement, listAnnouncements, listLiveAnnouncements } from "@/lib/data/announcements";
import { createAnnouncementSchema } from "@/lib/validation/announcements";

/**
 * GET /api/announcements[?all=1] — what the Home has been told.
 *
 * Live ones by default, which is what Today shows (S-50). `all=1` returns the
 * expired ones too: an announcement is a record of what was said and when, so
 * expiring hides it rather than erasing it.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  const all = new URL(request.url).searchParams.get("all") === "1";

  const announcements = all
    ? await listAnnouncements(session, house.id)
    : await listLiveAnnouncements(session, house.id);

  return jsonResponse({ announcements });
});

/**
 * POST /api/announcements — BR-260, Admins and Co-Admins only.
 *
 * `requireLeadMembership` is the first refusal and the insert policy in
 * migration 089 is the one that counts; a member reaching this route with a
 * service-role key would still be refused by the database.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireLeadMembership(session);
  const body = await parseBody(request, createAnnouncementSchema);

  const id = await createAnnouncement(session, house.id, member.id, body);

  return jsonResponse({ id }, 201);
});
