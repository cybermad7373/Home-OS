import { describe, expect, it } from "vitest";
import {
  claimUsernameSchema,
  createHouseSchema,
  joinHouseSchema,
  roomSchema,
  signInSchema,
  signUpSchema,
  updateMemberSchema,
} from "@/lib/validation/house";
import { isEmailIdentifier, usernameSchema } from "@/lib/validation/common";
import { houseToday, relativeTime } from "@/lib/utils/date";

/** Section 2 of docs/09-BUSINESS-RULES.md — field validation. */
const validSignUp = {
  display_name: "Ravi Kumar",
  username: "ravi_k",
  email: "a@b.com",
  password: "abcd1234",
};

describe("sign up", () => {
  it("requires a name of 2 to 50 characters", () => {
    expect(signUpSchema.safeParse({ ...validSignUp, display_name: "R" }).success).toBe(
      false,
    );
    expect(signUpSchema.safeParse(validSignUp).success).toBe(true);
  });

  it("requires a letter and a digit in the password", () => {
    expect(signUpSchema.safeParse({ ...validSignUp, password: "password" }).success).toBe(
      false,
    );
  });

  it("lowercases the email", () => {
    expect(signUpSchema.parse({ ...validSignUp, email: "Ravi@Example.COM" }).email).toBe(
      "ravi@example.com",
    );
  });

  it("requires a username", () => {
    expect(signUpSchema.safeParse({ ...validSignUp, username: undefined }).success).toBe(
      false,
    );
  });
});

describe("usernames", () => {
  it("accepts 3 to 20 characters starting with a letter", () => {
    expect(usernameSchema.safeParse("ravi").success).toBe(true);
    expect(usernameSchema.safeParse("ravi_k_2").success).toBe(true);
    expect(usernameSchema.safeParse("Ravi").success).toBe(true);
    expect(usernameSchema.safeParse("a".repeat(20)).success).toBe(true);
  });

  it("refuses names the database constraint would reject", () => {
    expect(usernameSchema.safeParse("ra").success).toBe(false);
    expect(usernameSchema.safeParse("a".repeat(21)).success).toBe(false);
    expect(usernameSchema.safeParse("1ravi").success).toBe(false);
    expect(usernameSchema.safeParse("_ravi").success).toBe(false);
    expect(usernameSchema.safeParse("ravi kumar").success).toBe(false);
    expect(usernameSchema.safeParse("ravi@home").success).toBe(false);
    expect(usernameSchema.safeParse("ravi-k").success).toBe(false);
  });

  it("is the same rule the claim endpoint applies", () => {
    expect(claimUsernameSchema.safeParse({ username: "ravi" }).success).toBe(true);
    expect(claimUsernameSchema.safeParse({ username: "ra" }).success).toBe(false);
  });
});

describe("sign in", () => {
  it("takes a username or an email in one field", () => {
    expect(signInSchema.safeParse({ identifier: "ravi", password: "x" }).success).toBe(
      true,
    );
    expect(
      signInSchema.safeParse({ identifier: "ravi@example.com", password: "x" }).success,
    ).toBe(true);
  });

  it("refuses an empty identifier", () => {
    expect(signInSchema.safeParse({ identifier: "  ", password: "x" }).success).toBe(false);
  });

  it("tells the two identifier kinds apart by the @", () => {
    expect(isEmailIdentifier("ravi@example.com")).toBe(true);
    expect(isEmailIdentifier("ravi")).toBe(false);
  });
});

describe("join house", () => {
  it("accepts a formatted code and normalises it", () => {
    expect(joinHouseSchema.parse({ invite_code: "hn4-k2p" }).invite_code).toBe("HN4K2P");
  });

  it("refuses an ambiguous glyph", () => {
    expect(joinHouseSchema.safeParse({ invite_code: "HN4K2O" }).success).toBe(false);
  });
});

describe("rooms", () => {
  it("holds capacity between 1 and 10", () => {
    expect(roomSchema.safeParse({ name: "Front", capacity: 0, monthly_rent: "9000" }).success).toBe(
      false,
    );
    expect(roomSchema.safeParse({ name: "Front", capacity: 11, monthly_rent: "9000" }).success).toBe(
      false,
    );
    expect(roomSchema.safeParse({ name: "Front", capacity: 3, monthly_rent: "9000" }).success).toBe(
      true,
    );
  });

  it("refuses a rent that looks like a typo", () => {
    expect(
      roomSchema.safeParse({ name: "Front", capacity: 3, monthly_rent: "900000" }).success,
    ).toBe(false);
  });
});

describe("member updates", () => {
  it("refuses an empty patch", () => {
    expect(updateMemberSchema.safeParse({}).success).toBe(false);
  });

  it("accepts an approval", () => {
    expect(updateMemberSchema.safeParse({ status: "active" }).success).toBe(true);
  });
});

describe("create house", () => {
  it("defaults to the house timezone and currency from the spec", () => {
    const parsed = createHouseSchema.parse({ name: "Anna Nagar Boys" });
    expect(parsed.timezone).toBe("Asia/Kolkata");
    expect(parsed.currency).toBe("INR");
  });
});

describe("house-timezone dates", () => {
  it("resolves the calendar day in the house's zone, not the server's", () => {
    // 18:45 UTC on 23 August is already 24 August in Kolkata.
    const at = new Date("2026-08-23T18:45:00Z");
    expect(houseToday("Asia/Kolkata", at)).toBe("2026-08-24");
    expect(houseToday("Europe/London", at)).toBe("2026-08-23");
  });

  it("describes recent timestamps in relative terms", () => {
    const now = new Date("2026-08-23T12:00:00Z");
    expect(relativeTime("2026-08-23T10:00:00Z", now)).toContain("2 hours");
  });
});
