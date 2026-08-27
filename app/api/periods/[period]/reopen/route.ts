import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { reopenPeriod } from "@/lib/data/settlement";
import { reopenPeriodSchema } from "@/lib/validation/settlement";

/**
 * POST /api/periods/:period/reopen — admin only.
 *
 * Reopening a settled month reopens the argument that closing it ended, so it
 * is deliberate, counted, and carries a reason (BR-112, BR-113). What was
 * already paid is not thrown away: the next close issues delta settlements
 * against the balances that already exist.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ period: string }> }) => {
    const session = await requireSession();
    const { house } = await requireAdminMembership(session);
    const { period } = await context.params;
    const { reason } = await parseBody(request, reopenPeriodSchema);

    const status = await reopenPeriod(session, house.id, period, reason);
    return jsonResponse({ period, status });
  },
);
