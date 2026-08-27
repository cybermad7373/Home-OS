import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { recurringUpdateSchema } from "@/lib/validation/expenses";
import { rupeesToPaise } from "@/lib/utils/money";
import { nextRunDate } from "@/lib/domain/expenses/recurring";
import type { RecurringExpenseRow } from "@/lib/types/database";

/** PATCH /api/recurring/:id — admin only. */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house } = await requireAdminMembership(session);
    const { id } = await context.params;
    const input = await parseBody(request, recurringUpdateSchema);

    const patch: Partial<RecurringExpenseRow> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.amount !== undefined) patch.amount_paise = rupeesToPaise(input.amount);
    if (input.category_id !== undefined) patch.category_id = input.category_id;
    if (input.paid_by_member_id !== undefined) {
      patch.paid_by_member_id = input.paid_by_member_id;
    }
    if (input.split_basis !== undefined) patch.split_basis = input.split_basis;
    if (input.day_of_month !== undefined) {
      patch.day_of_month = input.day_of_month;
      // Moving the day moves the next run, or the change would not take effect
      // until the month after next.
      patch.next_run_date = nextRunDate(input.day_of_month, house.timezone);
    }
    if (input.auto_approve !== undefined) patch.auto_approve = input.auto_approve;
    // BR-098 — deactivating stops future posting and leaves posted ones alone.
    if (input.active !== undefined) patch.active = input.active;

    const { data, error } = await session.supabase
      .from("recurring_expenses")
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

/** DELETE /api/recurring/:id — admin only. Posted instances are untouched. */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house } = await requireAdminMembership(session);
    const { id } = await context.params;

    const { error } = await session.supabase
      .from("recurring_expenses")
      .delete()
      .eq("id", id)
      .eq("house_id", house.id);

    if (error) throw apiErrorFromPostgres(error);
    return jsonResponse({ deleted: true });
  },
);
