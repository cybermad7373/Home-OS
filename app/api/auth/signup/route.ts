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
      emailRedirectTo: undefined,
    },
  });

if (error) {
    const reason = error.message.toLowerCase();
    if (reason.includes("already registered")) throw new ApiError("EMAIL_TAKEN");
    if (reason.includes("is invalid")) throw new ApiError("EMAIL_INVALID");
    if (reason.includes("rate limit")) throw new ApiError("EMAIL_RATE_LIMITED");
    if (reason.includes("email confirm")) throw new ApiError("EMAIL_CONFIRMATION_REQUIRED");
    if (reason.includes("username")) throw new ApiError("INVALID_USERNAME");
    if (reason.includes("password")) throw new ApiError("PASSWORD_INVALID");
    if (reason.includes("weak")) throw new ApiError("PASSWORD_TOO_WEAK");
    if (reason.includes("database")) throw new ApiError("DATABASE_ERROR");
    if (reason.includes("validation")) throw new ApiError("VALIDATION_FAILED", { cause: error.message });
    if (reason.includes("constraint")) throw new ApiError("CONSTRAINT_VIOLATION", { cause: error.message });
    // Log the full error for debugging
    const err = error as { details?: unknown; hint?: unknown };
    console.error("Signup error:", JSON.stringify({ message: error.message, code: error.code, details: err.details, hint: err.hint }, null, 2));
    throw new ApiError("INTERNAL", { cause: error.message, details: err.details as Record<string, unknown> | undefined });
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
