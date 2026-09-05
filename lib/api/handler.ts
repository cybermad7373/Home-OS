import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError, apiErrorFromPostgres } from "./errors";
import { logError, logWarning, newReference, redactPath } from "@/lib/infra/http/log";

/** Where the failure happened, as much of it as is safe to write down. */
interface Origin {
  route?: string;
  method?: string;
}

/** The error envelope from docs/05-API-SPEC.md section 1. */
export function errorResponse(error: unknown, origin: Origin = {}): NextResponse {
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const path = issue.path.join(".") || "_";
      fields[path] ??= issue.message;
    }
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Check the highlighted fields",
          details: { fields },
        },
      },
      { status: 422 },
    );
  }

  const apiError =
    error instanceof ApiError
      ? error
      : apiErrorFromPostgres(error as { message?: string; code?: string });

  const sqlstate =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : undefined;

  /*
   * `cause` never leaves the server.
   *
   * `apiErrorFromPostgres` is the fallback for every database error the
   * catalogue does not recognise, and it carried the raw Postgres message in
   * `details.cause` — which was then spread into the response body. So an
   * unmapped error anywhere in the API returned its Postgres text, and on
   * `/api/auth/signup`, which is public, it returned the error's `details` and
   * `hint` as well: constraint names, column names and schema hints, to an
   * unauthenticated caller.
   *
   * The value is worth keeping — it is what makes a 500 diagnosable — so it is
   * logged here and stripped from the body rather than removed at the six
   * places that set it.
   */
  const { cause, ...safeDetails } = apiError.details ?? {};

  /*
    A 500 gets a reference, and the reference is in both places.

    The screen already says "Something went wrong. It's been logged." — true,
    and useless to somebody reporting it. Eight characters they can quote turn
    that sentence into a line somebody can find. See `lib/infra/http/log.ts`
    for what a line may and may not carry; the short version is the shape of a
    failure and never its contents.
  */
  if (apiError.code === "INTERNAL") {
    const reference = newReference();
    logError({
      code: apiError.code,
      reference,
      route: origin.route,
      method: origin.method,
      status: apiError.status,
      sqlstate: sqlstate || undefined,
      // The database's own words. Never a request body and never a value a
      // member typed — the catalogue answers those long before here.
      message: typeof cause === "string" ? cause : undefined,
    });

    return NextResponse.json(
      { error: { code: apiError.code, message: apiError.message, reference } },
      { status: apiError.status },
    );
  }

  // A refusal the caller can act on is not an incident, but a 5xx among them
  // is: NETS_NONZERO says the balances do not net to zero, which is a defect.
  if (apiError.status >= 500 || cause !== undefined) {
    logWarning({
      code: apiError.code,
      route: origin.route,
      method: origin.method,
      status: apiError.status,
      sqlstate: sqlstate || undefined,
      message: typeof cause === "string" ? cause : undefined,
    });
  }

  const body =
    Object.keys(safeDetails).length === 0
      ? { code: apiError.code, message: apiError.message }
      : { code: apiError.code, message: apiError.message, details: safeDetails };

  return NextResponse.json({ error: body }, { status: apiError.status });
}

export function jsonResponse<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

/**
 * Wraps a route handler so no failure escapes as an unformatted 500.
 *
 * The first argument of every handler in this app is the `Request`, which is
 * where the route and the method for the log line come from. The URL is
 * redacted to its pattern before it is written down: `/api/expenses/<uuid>`
 * names one household's record, and `/api/expenses/[id]` names the defect.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      const request = args[0] as Request | undefined;
      const origin =
        request && typeof request === "object" && "url" in request
          ? { route: redactPath(request.url), method: request.method }
          : {};
      return errorResponse(error, origin);
    }
  };
}

/** Parses and validates a JSON body, throwing a ZodError the wrapper formats. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  return schema.parse(raw);
}
