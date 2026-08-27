import { jsonResponse, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { removeDependent } from "@/lib/data/mutations";

/**
 * DELETE /api/members/dependents/:id — a dependent moves out.
 *
 * Deactivation, not deletion. Their share of expenses already logged is part of
 * a month somebody may already have settled, and removing the row would change
 * a number the house has agreed on.
 */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house } = await requireAdminMembership(session);
    const { id } = await context.params;

    await removeDependent(session, house.id, id);
    return jsonResponse({ id, status: "inactive" });
  },
);
