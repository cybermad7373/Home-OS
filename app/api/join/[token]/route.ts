import { jsonResponse, route } from "@/lib/api/handler";
import { previewInvitation } from "@/lib/data/homes";
import { inviteTokenSchema } from "@/lib/validation/common";

/**
 * GET /api/join/:token — public and unauthenticated. What a person sees when
 * they open an invite link, before signing in.
 *
 * An invalid, expired or revoked token returns 404 with the same body shape
 * and `valid: false`. It never reveals whether the Home exists, which is why a
 * token that fails the shape check takes the same path as one that fails the
 * lookup rather than a 422 naming the format.
 */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ token: string }> }) => {
    const { token } = await context.params;
    const parsed = inviteTokenSchema.safeParse(token);
    const preview = parsed.success ? await previewInvitation(parsed.data) : null;

    if (!preview) {
      return jsonResponse(
        {
          valid: false,
          error: {
            code: "INVALID_INVITE",
            message: "That invite link isn't valid any more",
          },
        },
        404,
      );
    }

    return jsonResponse({
      house_name: preview.houseName,
      home_type: preview.homeType,
      member_count: preview.memberCount,
      valid: true,
    });
  },
);
