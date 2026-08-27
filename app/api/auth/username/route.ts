import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { isUsernameAvailable } from "@/lib/data/auth";
import { requireSession } from "@/lib/data/house";
import { apiErrorFromPostgres } from "@/lib/api/errors";
import { claimUsernameSchema } from "@/lib/validation/house";
import { usernameSchema } from "@/lib/validation/common";

/**
 * GET /api/auth/username?u=ravi — is this name free?
 *
 * Answers yes or no and nothing else. It never says who holds a taken name.
 */
export const GET = route(async (request: Request) => {
  const candidate = new URL(request.url).searchParams.get("u") ?? "";
  const parsed = usernameSchema.safeParse(candidate);

  if (!parsed.success) {
    return NextResponse.json(
      { available: false, reason: parsed.error.issues[0]?.message },
      { status: 200 },
    );
  }

  return jsonResponse({ available: await isUsernameAvailable(parsed.data) });
});

/**
 * POST /api/auth/username — claim one.
 *
 * This is the path a Google sign-in takes: OAuth supplies no username, so the
 * profile arrives without one and onboarding asks. Uniqueness is settled by the
 * database function and its unique index, not by the check above — two people
 * claiming the same name in the same second is exactly the case a check cannot
 * cover.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { username } = await parseBody(request, claimUsernameSchema);

  const { data, error } = await session.supabase.rpc("claim_username", {
    p_username: username,
  });

  if (error) {
    const mapped = apiErrorFromPostgres(error);
    throw mapped.code === "INTERNAL" ? new ApiError("USERNAME_TAKEN") : mapped;
  }

  return jsonResponse({ username: data as unknown as string });
});
