import type { Instrumentation } from "next";
import { logError, redactPath } from "@/lib/infra/http/log";

/**
 * Every server error that never reached a route handler.
 *
 * `lib/api/handler.ts` catches what happens inside `/api/*`. This catches the
 * rest, which until now went nowhere anybody would find: a screen that throws
 * while rendering shows `app/error.tsx` with a digest on it, and that digest
 * was the only trace — matching nothing, because nothing was written down. A
 * person reporting "it said something went wrong" had a reference number for a
 * log line that did not exist.
 *
 * Next hands this the digest it showed. That is the join: the eight-or-so
 * characters on the screen appear in a line here, so the report and the failure
 * can be put side by side.
 *
 * The same rule as everywhere else applies to what is written: the route
 * pattern, never the URL, because the URL of a household screen says which
 * household and which record. See `lib/infra/http/log.ts`.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : undefined;

  logError({
    code: "UNCAUGHT",
    // The digest is what the person is looking at, so it is the reference.
    reference: digest ?? "no-digest",
    route: redactPath(request.path),
    method: request.method,
    status: 500,
    // A framework or runtime message. Anything a member typed has been through
    // validation and answered long before a throw gets here.
    message: error instanceof Error ? error.message : String(error),
    // Which half of the app failed: a rendered screen, a route handler, or the
    // proxy. Three very different investigations.
    routeType: context.routeType,
  });
};
