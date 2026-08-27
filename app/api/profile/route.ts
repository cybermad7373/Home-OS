import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { getMembership, requireSession } from "@/lib/data/house";
import { setOwnCookingFlag, updateOwnProfile } from "@/lib/data/mutations";
import { updateProfileSchema } from "@/lib/validation/house";

/**
 * PATCH /api/profile — the caller's own profile. The cooking flag lives on the
 * membership rather than the user, so it is applied separately.
 */
export const PATCH = route(async (request: Request) => {
  const session = await requireSession();
  const input = await parseBody(request, updateProfileSchema);
  const { can_cook, ...profile } = input;

  const user =
    Object.keys(profile).length > 0 ? await updateOwnProfile(session, profile) : null;

  if (can_cook !== undefined) {
    const membership = await getMembership(session);
    if (membership && membership.member.status === "active") {
      await setOwnCookingFlag(session, membership.member.id, can_cook);
    }
  }

  return jsonResponse({ user, can_cook: can_cook ?? null });
});
