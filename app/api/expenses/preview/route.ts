import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { prepareSplit } from "@/lib/data/expense-service";
import { previewSplitSchema } from "@/lib/validation/expenses";

/**
 * POST /api/expenses/preview — what this expense would cost each person.
 *
 * The add sheet shows "Your share: ₹155.00 · 8 people" live, and it has to be
 * the real calculator rather than an approximation in the browser, or the
 * number under the button will disagree with the number that gets saved.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const input = await parseBody(request, previewSplitSchema);

  const prepared = await prepareSplit(session, house.id, {
    amount: input.amount,
    expenseDate: input.expense_date,
    splitBasis: input.split_basis,
    customShares: input.custom_shares,
    // Under the payer basis the whole amount lands on one member. Absent an
    // explicit payer the caller is paying, which is what the sheet assumes.
    paidByMemberId: input.paid_by_member_id ?? member.id,
  });

  const mine = prepared.splits.find((split) => split.memberId === member.id);

  return jsonResponse({
    heads: prepared.heads,
    amount_paise: prepared.amountPaise,
    your_share_paise:
      (mine?.sharePaise ?? 0) +
      (mine?.guestSharePaise ?? 0) +
      (mine?.dependentSharePaise ?? 0),
    splits: prepared.splits.map((split) => ({
      member_id: split.memberId,
      share_paise: split.sharePaise,
      guest_share_paise: split.guestSharePaise,
      dependent_share_paise: split.dependentSharePaise,
    })),
  });
});
