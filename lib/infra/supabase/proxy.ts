import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Routes reachable without a session. Everything else redirects to sign in.
 *
 * `/api/auth` is on the list because those endpoints ARE the way in — sign-up
 * and sign-in have no session yet by definition. The ones among them that do
 * need a caller, such as claiming a username, check for it themselves.
 */
const PUBLIC_PREFIXES = [
  "/signin",
  "/signup",
  "/auth",
  "/api/auth",
  "/offline",
  "/manifest.webmanifest",
  "/sw.js",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Refreshes the Supabase session cookie on every request and keeps signed-out
 * visitors out of the app. This is convenience and correctness of navigation —
 * the security boundary is RLS, not this function.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser, not getSession: it revalidates the token with Supabase rather than
  // trusting a cookie the browser could have edited. An unreachable auth server
  // is treated as "not signed in" rather than a 500 on every route — the sign-in
  // page still has to render when the network is down.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    console.warn("[proxy] could not reach Supabase auth", error);
  }

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/signin";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && (pathname === "/signin" || pathname === "/signup")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/dashboard";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}
