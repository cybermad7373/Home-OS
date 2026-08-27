import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/infra/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. The service worker and
     * the manifest are matched deliberately — they are listed as public routes
     * so an installed PWA can boot its shell while signed out.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
