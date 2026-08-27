import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { choreTemplateUpdateSchema } from "@/lib/validation/chores";
import type { ChoreTemplateRow } from "@/lib/types/database";

/** PATCH /api/chores/templates/:id — admin only. */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house } = await requireAdminMembership(session);
    const { id } = await context.params;
    const input = await parseBody(request, choreTemplateUpdateSchema);

    const patch: Partial<ChoreTemplateRow> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        (patch as Record<string, unknown>)[key] = value;
      }
    }

    const { data, error } = await session.supabase
      .from("chore_templates")
      .update(patch)
      .eq("id", id)
      .eq("house_id", house.id)
      .select("*")
      .maybeSingle();

    if (error) throw apiErrorFromPostgres(error);
    if (!data) throw new ApiError("NOT_FOUND");
    return jsonResponse(data);
  },
);

/**
 * DELETE /api/chores/templates/:id — admin only.
 *
 * Deactivates rather than deletes. Assignments reference the template for their
 * name and category, and a past week must still read correctly.
 */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house } = await requireAdminMembership(session);
    const { id } = await context.params;

    const { error } = await session.supabase
      .from("chore_templates")
      .update({ active: false })
      .eq("id", id)
      .eq("house_id", house.id);

    if (error) throw apiErrorFromPostgres(error);
    return jsonResponse({ id, active: false });
  },
);
