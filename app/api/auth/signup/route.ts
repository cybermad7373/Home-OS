import { ApiError } from "@/lib/api/errors";
import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { isUsernameAvailable } from "@/lib/data/auth";
import { createClient } from "@/lib/infra/supabase/server";
import { signUpSchema } from "@/lib/validation/house";

/**
 * POST /api/auth/signup — create an account with a display name, a unique
 * username, an email and a password.
 *
 * The username is checked here before the auth user is created, so the common
 * case fails cleanly with "that username is taken" instead of stranding an auth
 * user whose profile could not be written. A name claimed in the gap between
 * this check and the profile trigger leaves the profile without a username, and
 * onboarding asks for one — see the trigger in migration 014.
 */
export const POST = route(async (request: Request) => {
  const input = await parseBody(request, signUpSchema);

  if (!(await isUsernameAvailable(input.username))) {
    throw new ApiError("USERNAME_TAKEN");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        display_name: input.display_name,
        username: input.username,
      },
    },
  });

  if (error) {
    const reason = error.message.toLowerCase();
    if (reason.includes("already registered")) throw new ApiError("EMAIL_TAKEN");
    if (reason.includes("is invalid")) throw new ApiError("EMAIL_INVALID");
    // The free tier sends about two confirmation emails an hour. Onboarding a
    // whole house in one evening hits that, and the fix is a project setting,
    // so the message says so rather than blaming the person signing up.
    if (reason.includes("rate limit")) throw new ApiError("EMAIL_RATE_LIMITED");
    throw new ApiError("INTERNAL", { cause: error.message });
  }

  // With email confirmation switched on, Supabase returns a user but no
  // session. The client needs to know which of the two happened.
  return jsonResponse(
    {
      user_id: data.user?.id ?? null,
      needs_email_confirmation: data.session === null,
    },
    201,
  );
});
