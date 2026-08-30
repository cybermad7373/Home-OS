import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { recurringUpdateSchema } from "@/lib/validation/expenses";
import { rupeesToPaise } from "@/lib/utils/money";
import { nextRunDate } from "@/lib/domain/expenses/recurring";
import type { RecurringExpenseRow } from "@/lib/types/database";
import { deleteRecurring, updateRecurring } from "@/lib/data/expenses";

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

    return jsonResponse(await updateRecurring(session, house.id, id, patch));
  },
);

/** DELETE /api/recurring/:id — admin only. Posted instances are untouched. */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house } = await requireAdminMembership(session);
    const { id } = await context.params;

    await deleteRecurring(session, house.id, id);
    return jsonResponse({ deleted: true });
  },
);
