import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { apiErrorFromPostgres } from "@/lib/api/errors";
import {
  requireActiveMembership,
  requireAdminMembership,
  requireSession,
} from "@/lib/data/house";
import { listTemplates } from "@/lib/data/chores";
import { choreTemplateSchema } from "@/lib/validation/chores";

/** GET /api/chores/templates — what the house has decided needs doing. */
export const GET = route(async () => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  return jsonResponse({ templates: await listTemplates(session, house.id) });
});

/** POST /api/chores/templates — admin only. */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireAdminMembership(session);
  const input = await parseBody(request, choreTemplateSchema);

  const { data, error } = await session.supabase
    .from("chore_templates")
    .insert({
      house_id: house.id,
      name: input.name,
      category: input.category,
      effort_points: input.effort_points,
      duration_min: input.duration_min,
      slot: input.slot,
      scope: input.scope,
      room_id: input.room_id ?? null,
      frequency: input.frequency,
      times_per_week: input.times_per_week ?? null,
      requires_cooking_skill: input.requires_cooking_skill ?? false,
      is_heavy: input.is_heavy ?? false,
      active: input.active ?? true,
    })
    .select("*")
    .single();

  if (error) throw apiErrorFromPostgres(error);
  return jsonResponse(data, 201);
});
