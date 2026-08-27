import { ApiError } from "@/lib/api/errors";
import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { resolveIdentifier } from "@/lib/data/auth";
import { createClient } from "@/lib/infra/supabase/server";
import { signInSchema } from "@/lib/validation/house";

/**
 * POST /api/auth/signin — sign in with a username or an email.
 *
 * It runs on the server for one reason: resolving a username to an email needs
 * the service-role key, and a browser that could do that resolution could walk
 * the whole house's email list. The browser sends what the person typed and
 * gets back a session cookie or one flat failure message.
 *
 * The failure message is the same whether the identifier is unknown or the
 * password is wrong. Distinguishing them tells a stranger which usernames exist.
 */
export const POST = route(async (request: Request) => {
  const { identifier, password } = await parseBody(request, signInSchema);

  const email = await resolveIdentifier(identifier);
  if (!email) throw new ApiError("BAD_CREDENTIALS");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("not confirmed")) {
      throw new ApiError("EMAIL_NOT_CONFIRMED");
    }
    throw new ApiError("BAD_CREDENTIALS");
  }

  return jsonResponse({ user_id: data.user?.id ?? null });
});
