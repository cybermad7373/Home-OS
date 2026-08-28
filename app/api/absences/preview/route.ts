import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { previewAbsence } from "@/lib/data/absence";
import { absencePreviewSchema } from "@/lib/validation/absence";

/**
 * POST /api/absences/preview — AV-08.
 *
 * "An absence request against a published week shows exactly which chores and
 * how many points are affected before it is submitted." A POST rather than a
 * GET because the range is a body the form already holds, and because the
 * answer is not cacheable — it changes as the week is worked through.
 *
 * It writes nothing. The same two computations run again when the request is
 * actually made, so the sheet cannot promise something the proposal will not
 * do.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const body = await parseBody(request, absencePreviewSchema);

  return jsonResponse(
    await previewAbsence(session, house.id, member.id, body.from_date, body.to_date),
  );
});
