import { describe, expect, it } from "vitest";
import { apiErrorFromPostgres } from "@/lib/api/errors";

/**
 * What a database refusal is turned into before somebody reads it.
 *
 * Two of these were wrong in ways nobody would notice from the code and
 * everybody notices from the screen: every unique violation answered
 * ROOM_NAME_TAKEN, so a second category called Groceries was refused with "A
 * room with that name already exists" on a screen with no rooms on it; and a
 * malformed uuid off a URL answered INTERNAL, so a stale link read as "Something
 * went wrong. It's been logged." and left a 500 in the logs.
 */

describe("apiErrorFromPostgres", () => {
  it("names the thing that was actually duplicated", () => {
    expect(
      apiErrorFromPostgres({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "expense_categories_house_id_name_key"',
      }).code,
    ).toBe("CATEGORY_NAME_TAKEN");

    expect(
      apiErrorFromPostgres({
        code: "23505",
        message: 'duplicate key value violates unique constraint "rooms_house_id_name_key"',
      }).code,
    ).toBe("ROOM_NAME_TAKEN");

    expect(
      apiErrorFromPostgres({
        code: "23505",
        message: 'duplicate key value violates unique constraint "reserves_house_id_name_key"',
      }).code,
    ).toBe("RESERVE_NAME_TAKEN");
  });

  it("reads the constraint out of details when the message does not carry it", () => {
    expect(
      apiErrorFromPostgres({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: 'Key (house_id, name)=(...) already exists in rooms_house_id_name_key.',
      }).code,
    ).toBe("ROOM_NAME_TAKEN");
  });

  it("says the true general thing for a constraint it does not know", () => {
    const error = apiErrorFromPostgres({
      code: "23505",
      message: 'duplicate key value violates unique constraint "something_new_key"',
    });

    expect(error.code).toBe("NAME_TAKEN");
    expect(error.status).toBe(409);
  });

  it("treats a bad cast as a bad request rather than a server fault", () => {
    for (const code of ["22P02", "22007", "22008"]) {
      const error = apiErrorFromPostgres({
        code,
        message: 'invalid input syntax for type uuid: "not-a-uuid"',
      });
      expect(error.code, code).toBe("VALIDATION_FAILED");
      expect(error.status, code).toBe(422);
    }
  });

  it("still recognises a guard that raises its own code as the message", () => {
    expect(apiErrorFromPostgres({ message: "LAST_ADMIN", code: "P0001" }).code).toBe(
      "LAST_ADMIN",
    );
  });

  it("names a taken username rather than the generic duplicate", () => {
    expect(
      apiErrorFromPostgres({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "uq_users_username_lower"',
      }).code,
    ).toBe("USERNAME_TAKEN");
  });

  it("treats a username shape violation as a bad value, not a server fault", () => {
    const error = apiErrorFromPostgres({
      code: "23514",
      message:
        'new row for relation "users" violates check constraint "users_username_shape"',
    });
    expect(error.code).toBe("INVALID_USERNAME");
    expect(error.status).toBe(422);
  });

  it("treats an unknown check violation as a bad request rather than a fault", () => {
    const error = apiErrorFromPostgres({
      code: "23514",
      message: 'new row violates check constraint "something_else"',
    });
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.status).toBe(422);
  });

  it("keeps a genuine fault a fault", () => {
    const error = apiErrorFromPostgres({ code: "XX000", message: "internal error" });

    expect(error.code).toBe("INTERNAL");
    expect(error.status).toBe(500);
  });
});
