import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { apiErrorFromPostgres } from "@/lib/api/errors";
import {
  requireActiveMembership,
  requireAdminMembership,
  requireSession,
} from "@/lib/data/house";
import { listRecurring } from "@/lib/data/expenses";
import { recurringSchema } from "@/lib/validation/expenses";
import { rupeesToPaise } from "@/lib/utils/money";
import { nextRunDate } from "@/lib/domain/expenses/recurring";

/** GET /api/recurring — the definitions. The daily job posts them. */
export const GET = route(async () => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  return jsonResponse({ recurring: await listRecurring(session, house.id) });
});

/** POST /api/recurring — admin only. */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireAdminMembership(session);
  const input = await parseBody(request, recurringSchema);

  const { data, error } = await session.supabase
    .from("recurring_expenses")
    .insert({
      house_id: house.id,
      name: input.name,
      amount_paise: rupeesToPaise(input.amount),
      category_id: input.category_id,
      paid_by_member_id: input.paid_by_member_id ?? null,
      split_basis: input.split_basis,
      day_of_month: input.day_of_month,
      auto_approve: input.auto_approve ?? true,
      active: input.active ?? true,
      next_run_date: nextRunDate(input.day_of_month, house.timezone),
    })
    .select("*")
    .single();

  if (error) throw apiErrorFromPostgres(error);
  return jsonResponse(data, 201);
});
