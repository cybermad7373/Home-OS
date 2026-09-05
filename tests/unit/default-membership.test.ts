import { describe, expect, it } from "vitest";
import { defaultMembership, type Membership } from "@/lib/data/house";
import type { HouseMemberRow, HouseRow } from "@/lib/types/domain";

/**
 * The Home somebody who has chosen nothing gets.
 *
 * This used to be `memberships[0]` off a query ordered by `joined_date` alone.
 * `joined_date` is a date, so two Homes joined on one day tie, and Postgres
 * returned them in whatever order it liked — the same account landed in a
 * different Home on consecutive sign-ins. Anybody who administers one Home and
 * is an ordinary member of another spent that sign-in in an app with every
 * create control hidden and nothing on screen saying why.
 */

function membership(
  id: string,
  role: HouseMemberRow["role"],
  status: HouseMemberRow["status"] = "active",
): Membership {
  return {
    member: { id: `m-${id}`, house_id: id, role, status } as HouseMemberRow,
    house: { id, name: `Home ${id}` } as HouseRow,
  };
}

describe("defaultMembership", () => {
  it("has no answer for somebody who belongs to nothing", () => {
    expect(defaultMembership([])).toBeNull();
  });

  it("prefers a Home the caller runs over one they only live in", () => {
    const memberships = [
      membership("sharma", "member"),
      membership("velachery", "member"),
      membership("anna-nagar", "admin"),
    ];

    expect(defaultMembership(memberships)?.house.id).toBe("anna-nagar");
  });

  it("counts a co-admin as running a Home", () => {
    const memberships = [membership("a", "member"), membership("b", "co_admin")];

    expect(defaultMembership(memberships)?.house.id).toBe("b");
  });

  it("takes the first Active membership when the caller runs none", () => {
    const memberships = [membership("a", "member"), membership("b", "member")];

    expect(defaultMembership(memberships)?.house.id).toBe("a");
  });

  it("never lands somebody in a Home they are only waiting on", () => {
    const memberships = [
      membership("requested", "admin", "requested"),
      membership("active", "member"),
    ];

    expect(defaultMembership(memberships)?.house.id).toBe("active");
  });

  it("falls back to a Requested Home when that is all there is", () => {
    const memberships = [membership("requested", null, "requested")];

    expect(defaultMembership(memberships)?.house.id).toBe("requested");
  });

  it("answers the same for the same memberships every time", () => {
    const memberships = [
      membership("sharma", "member"),
      membership("velachery", "member"),
      membership("anna-nagar", "admin"),
    ];

    const answers = new Set(
      Array.from({ length: 20 }, () => defaultMembership(memberships)?.house.id),
    );

    expect(answers).toEqual(new Set(["anna-nagar"]));
  });
});
