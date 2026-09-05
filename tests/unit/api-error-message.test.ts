import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "@/lib/utils/api-error-message";

/**
 * A room saved with a negative rent was refused with "Check the highlighted
 * fields" and nothing highlighted — technically true, useless, and
 * indistinguishable from a bug. The specific reason was in the response the
 * whole time; the screens were reading past it.
 */
describe("apiErrorMessage", () => {
  it("prefers the reason the field was rejected for", () => {
    expect(
      apiErrorMessage(
        {
          error: {
            message: "Check the highlighted fields",
            details: { fields: { monthly_rent: "Rent cannot be negative" } },
          },
        },
        "fallback",
      ),
    ).toBe("Rent cannot be negative");
  });

  it("skips a field whose reason is blank", () => {
    expect(
      apiErrorMessage(
        {
          error: {
            message: "Check the highlighted fields",
            details: { fields: { a: "   ", b: "Pick a category" } },
          },
        },
        "fallback",
      ),
    ).toBe("Pick a category");
  });

  it("falls back to the message when there are no fields", () => {
    expect(
      apiErrorMessage({ error: { message: "A room with that name already exists" } }, "fallback"),
    ).toBe("A room with that name already exists");
  });

  it("falls back to the caller's words for a body that says nothing", () => {
    for (const body of [null, undefined, {}, { error: {} }, { error: { message: "  " } }, "nonsense"]) {
      expect(apiErrorMessage(body, "That did not work")).toBe("That did not work");
    }
  });
});
