import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import {
  requireActiveMembership,
  requireAdminMembership,
  requireSession,
} from "@/lib/data/house";
import { listRecurring } from "@/lib/data/expenses";
import { recurringSchema } from "@/lib/validation/expenses";
import { rupeesToPaise } from "@/lib/utils/money";
import { nextRunDate } from "@/lib/domain/expenses/recurring";
import { createRecurring } from "@/lib/data/expenses";

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

  const recurring = await createRecurring(session, house.id, {
    name: input.name,
    amountPaise: rupeesToPaise(input.amount),
    categoryId: input.category_id,
    paidByMemberId: input.paid_by_member_id ?? null,
    splitBasis: input.split_basis,
    dayOfMonth: input.day_of_month,
    autoApprove: input.auto_approve ?? true,
    active: input.active ?? true,
    nextRunDate: nextRunDate(input.day_of_month, house.timezone),
  });

  return jsonResponse(recurring, 201);
});
