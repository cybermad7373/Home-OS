import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { categoryUpdateSchema } from "@/lib/validation/expenses";
import { rupeesToPaise } from "@/lib/utils/money";
import type { ExpenseCategoryRow } from "@/lib/types/database";

/** PATCH /api/categories/:id — admin only. Budgets feed the phase-7 alerts. */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house } = await requireAdminMembership(session);
    const { id } = await context.params;
    const input = await parseBody(request, categoryUpdateSchema);

    const patch: Partial<ExpenseCategoryRow> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.icon !== undefined) patch.icon = input.icon || null;
    if (input.active !== undefined) patch.active = input.active;
    if (input.monthly_budget !== undefined) {
      patch.monthly_budget_paise = input.monthly_budget
        ? rupeesToPaise(input.monthly_budget)
        : null;
    }

    const { data, error } = await session.supabase
      .from("expense_categories")
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
