import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError, apiErrorFromPostgres } from "./errors";

/** The error envelope from docs/05-API-SPEC.md section 1. */
export function errorResponse(error: unknown): NextResponse {
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

  if (apiError.code === "INTERNAL") {
    console.error("[api] unhandled error", error);
  }

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
  if (cause !== undefined) {
    console.error(`[api] ${apiError.code}`, cause);
  }

  // A 500 tells the client nothing beyond its own sentence. Anything a caller
  // could act on has a code of its own in the catalogue.
  const body =
    apiError.code === "INTERNAL" || Object.keys(safeDetails).length === 0
      ? { code: apiError.code, message: apiError.message }
      : { code: apiError.code, message: apiError.message, details: safeDetails };

  return NextResponse.json({ error: body }, { status: apiError.status });
}

export function jsonResponse<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

/** Wraps a route handler so no failure escapes as an unformatted 500. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
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
