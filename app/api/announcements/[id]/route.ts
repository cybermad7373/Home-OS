import { jsonResponse, route } from "@/lib/api/handler";
import { requireLeadMembership, requireSession } from "@/lib/data/house";
import { deleteAnnouncement } from "@/lib/data/announcements";

/**
 * DELETE /api/announcements/:id — take one down before it expires.
 *
 * Expiry is the ordinary way an announcement ends. This is for the one posted
 * by mistake, and it is a lead's privilege for the same reason posting is.
 */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireLeadMembership(session);
    const { id } = await context.params;

    await deleteAnnouncement(session, id);

    return jsonResponse({ ok: true });
  },
);
