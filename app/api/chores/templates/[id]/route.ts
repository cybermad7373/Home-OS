import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { choreTemplateUpdateSchema } from "@/lib/validation/chores";
import type { ChoreTemplateRow } from "@/lib/types/database";
import { deactivateTemplate, updateTemplate } from "@/lib/data/chores";

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

    return jsonResponse(await updateTemplate(session, house.id, id, patch));
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

    await deactivateTemplate(session, house.id, id);
    return jsonResponse({ id, active: false });
  },
);
