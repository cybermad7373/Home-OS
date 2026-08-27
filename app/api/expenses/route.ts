import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { listExpenses } from "@/lib/data/expenses";
import { createExpenseWithSplit } from "@/lib/data/expense-service";
import { createExpenseSchema, expenseFilterSchema } from "@/lib/validation/expenses";

/** GET /api/expenses — the list, filtered, with running totals. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = expenseFilterSchema.parse(params);

  const result = await listExpenses(session, house.id, member.id, {
    period: filters.period,
    categoryId: filters.category,
    memberId: filters.member,
    from: filters.from,
    to: filters.to,
    page: filters.page,
  });

  return jsonResponse(result);
});

/**
 * POST /api/expenses — log one.
 *
 * The split is computed here and stored (BR-088); it is never recomputed on
 * read. What the house saw when it was logged is what the house is held to.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const input = await parseBody(request, createExpenseSchema);

  const created = await createExpenseWithSplit(session, house.id, house.timezone, {
    amount: input.amount,
    categoryId: input.category_id,
    expenseDate: input.expense_date,
    splitBasis: input.split_basis,
    description: input.description || undefined,
    paidByMemberId: input.paid_by_member_id,
    receiptUrl: input.receipt_url || undefined,
    customShares: input.custom_shares,
    // Whoever the expense says paid, defaulting to the person logging it. Only
    // the payer basis reads it; the others work it out from the membership.
    payerMemberId: input.paid_by_member_id ?? member.id,
  });

  return jsonResponse(created, 201);
});
