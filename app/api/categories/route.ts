import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { apiErrorFromPostgres } from "@/lib/api/errors";
import {
  requireActiveMembership,
  requireAdminMembership,
  requireSession,
} from "@/lib/data/house";
import { listCategories } from "@/lib/data/expenses";
import { categorySchema } from "@/lib/validation/expenses";
import { rupeesToPaise } from "@/lib/utils/money";

/** GET /api/categories — every category, with its budget. */
export const GET = route(async () => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  return jsonResponse({ categories: await listCategories(session, house.id) });
});

/** POST /api/categories — admin only. */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireAdminMembership(session);
  const input = await parseBody(request, categorySchema);

  const { data, error } = await session.supabase
    .from("expense_categories")
    .insert({
      house_id: house.id,
      name: input.name,
      icon: input.icon || null,
      monthly_budget_paise: input.monthly_budget
        ? rupeesToPaise(input.monthly_budget)
        : null,
    })
    .select("*")
    .single();

  if (error) throw apiErrorFromPostgres(error);
  return jsonResponse(data, 201);
});
