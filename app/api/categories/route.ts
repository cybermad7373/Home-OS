import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import {
  requireActiveMembership,
  requireAdminMembership,
  requireSession,
} from "@/lib/data/house";
import { listCategories } from "@/lib/data/expenses";
import { categorySchema } from "@/lib/validation/expenses";
import { rupeesToPaise } from "@/lib/utils/money";
import { createCategory } from "@/lib/data/expenses";

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

  const category = await createCategory(session, house.id, {
    name: input.name,
    icon: input.icon,
    monthlyBudgetPaise: input.monthly_budget ? rupeesToPaise(input.monthly_budget) : null,
  });

  return jsonResponse(category, 201);
});
