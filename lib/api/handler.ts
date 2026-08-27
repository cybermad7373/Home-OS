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

  return NextResponse.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        ...(apiError.details ? { details: apiError.details } : {}),
      },
    },
    { status: apiError.status },
  );
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
