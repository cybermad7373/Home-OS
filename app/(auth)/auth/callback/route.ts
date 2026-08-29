import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/infra/supabase/server";

/**
 * The OAuth return path. Supabase sends the browser here with a one-time code,
 * which is exchanged for a session cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";

  if (!code) {
    return NextResponse.redirect(`${origin}/signin?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/signin?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
