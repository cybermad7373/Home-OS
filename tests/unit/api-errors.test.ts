import { describe, expect, it, vi, afterEach } from "vitest";
import { errorResponse } from "@/lib/api/handler";
import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";

/**
 * What an error tells the caller, and what it only tells the server.
 *
 * `apiErrorFromPostgres` is the fallback for every database error the
 * catalogue does not recognise, and it puts the raw Postgres message in
 * `details.cause`. That object used to be spread into the response body, so an
 * unmapped error anywhere in the API returned its Postgres text to whoever
 * asked — and `/api/auth/signup`, which has no session by definition and is
 * therefore reachable by anybody, additionally returned the error's `details`
 * and `hint`: constraint names, column names, schema hints.
 *
 * The value is worth keeping, because it is what makes a 500 diagnosable. It
 * is logged and stripped rather than discarded.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

async function bodyOf(response: Response): Promise<{
  error: { code: string; message: string; details?: Record<string, unknown> };
}> {
  return response.json();
}

describe("an error response never carries its cause", () => {
  it("strips the raw Postgres message an unmapped database error arrives with", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const postgres = {
      message: 'duplicate key value violates unique constraint "house_members_pkey"',
      code: "23505",
    };
    const response = errorResponse(apiErrorFromPostgres({ ...postgres, message: "something unmapped" }));
    const body = await bodyOf(response);

    expect(body.error.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("something unmapped");
  });

  it("logs the cause rather than discarding it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    errorResponse(new ApiError("VALIDATION_FAILED", { cause: "column display_name is null" }));

    expect(logged).toHaveBeenCalled();
    const flat = logged.mock.calls.flat().join(" ");
    expect(flat).toContain("column display_name is null");
  });

  it("says nothing at all beyond its own sentence on a 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = errorResponse(
      new ApiError("INTERNAL", { cause: "PGRST301: JWT expired", extra: "not for the caller" }),
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(500);
    expect(body.error.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("JWT expired");
    expect(JSON.stringify(body)).not.toContain("not for the caller");
  });

  it("still returns the details a caller is meant to act on", async () => {
    // Field-level validation is the whole point of the envelope, and is not a
    // leak: the caller supplied those fields.
    const response = errorResponse(
      new ApiError("VALIDATION_FAILED", { fields: { name: "Name it" } }),
    );
    const body = await bodyOf(response);

    expect(body.error.details).toEqual({ fields: { name: "Name it" } });
  });

  it("keeps the actionable details and drops only the cause when both are present", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = errorResponse(
      new ApiError("ROOM_FULL", { capacity: 2, cause: "trigger room_capacity fired" }),
    );
    const body = await bodyOf(response);

    expect(body.error.details).toEqual({ capacity: 2 });
    expect(JSON.stringify(body)).not.toContain("trigger room_capacity");
  });

  it("omits details entirely rather than sending an empty object", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = errorResponse(new ApiError("NOT_FOUND", { cause: "no rows" }));
    const body = await bodyOf(response);

    expect(body.error).not.toHaveProperty("details");
  });

  it("keeps the code and the human sentence, which are what a client renders", async () => {
    const response = errorResponse(new ApiError("EMAIL_TAKEN"));
    const body = await bodyOf(response);

    expect(body.error.code).toBe("EMAIL_TAKEN");
    expect(body.error.message.length).toBeGreaterThan(0);
    expect(response.status).toBe(409);
  });
});
