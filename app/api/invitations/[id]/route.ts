import { jsonResponse, route } from "@/lib/api/handler";
import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import { requireLeadMembership, requireSession } from "@/lib/data/house";

/**
 * DELETE /api/invitations/:id — revoke the link without issuing a new one.
 *
 * A Home with no live link is a legitimate state: nobody new can ask until a
 * lead rotates one. That is the only way to close the door.
 */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house } = await requireLeadMembership(session);
    const { id } = await context.params;

    const { data, error } = await session.supabase
      .from("invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("house_id", house.id)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();

    if (error) throw apiErrorFromPostgres(error);
    if (!data) throw new ApiError("NOT_FOUND");
    return jsonResponse({ revoked: true });
  },
);
