import { describe, expect, it } from "vitest";
import { buildSchedulePayload } from "@/lib/domain/llm/schedule";
import { buildDigestPayload } from "@/lib/domain/llm/digest";
import { payloadFor as foodNormalisePayload } from "@/lib/domain/llm/food-normalise";
import { findForbidden, findPlanted } from "@/lib/infra/llm/redact";
import type {
  ChoreInstance,
  SchedulingMember,
  WeekWindows,
} from "@/lib/domain/scheduling/types";

/**
 * The redaction contract, tested across the call sites at once —
 * docs/10-LLM-SPEC.md section 4.
 *
 * That section says the contract is "enforced by a dedicated test". It was not,
 * quite: `findForbidden` was asserted at three call sites individually, against
 * fixtures whose values were ordinary, and it only ever recognised three shapes
 * — a UUID, an email and a long run of digits. Nothing checked the rest of the
 * forbidden list, and nothing checked the food call sites at all.
 *
 * The rest of that list is surnames, house names, streets, room names and
 * expense descriptions, and none of them has a shape a pattern can match: they
 * are ordinary words. So this plants a known, unmistakable value in every input
 * field a builder reads, builds the payload, and looks for the planted values in
 * what comes out. That is a stronger assertion than a pattern in any case — it
 * is about the value actually supplied rather than a family of values that
 * resemble it — and a failure names the field that leaked.
 */

/**
 * One value per forbidden thing, each unmistakable in a haystack. Real-looking
 * where the shape matters — the email and the UUID also exercise
 * `findForbidden` — and absurd where it does not, so a substring match cannot
 * fire by accident on an ordinary word.
 */
const PLANTED = {
  surname: "Qvortrupzelen",
  email: "zzhousemate@qvortrupzelen.example",
  uuid: "3f0c1c8e-2d4b-4a19-9f77-0b2a6c1d5e44",
  phone: "9876501234",
  upi: "qvortrupzelen@okhdfcbank",
  houseName: "Zyxwvu Mansion",
  street: "144 Qqqzz Cross Street",
  roomName: "Qqqzz Balcony Room",
  expenseDescription: "Qqqzz cigarettes and a bottle",
} as const;

const WEEK = "2026-08-24";
const SECOND_UUID = "8b71a2d0-55e3-4c6f-9a10-77ce2f4b8d31";

describe("call site 1 — the schedule payload", () => {
  function windows(dates: string[]): WeekWindows {
    return new Map(
      dates.map((date) => [date, [{ kind: "full" as const, startMin: 360, endMin: 1380 }]]),
    );
  }

  function build() {
    // Every field that takes a string takes a planted one. The member ids are
    // real UUIDs because that is what the database hands the builder, and the
    // whole point of the opaque mapping is that they do not survive it.
    const members: SchedulingMember[] = [
      {
        memberId: PLANTED.uuid,
        canCook: true,
        roomId: PLANTED.roomName,
        residency: "full_time",
        joinedDate: "2026-01-01",
        leftDate: null,
      },
      {
        memberId: SECOND_UUID,
        canCook: false,
        roomId: null,
        residency: "full_time",
        joinedDate: "2026-01-01",
        leftDate: null,
      },
    ];

    const instances: ChoreInstance[] = members.map((member, index) => ({
      id: `i-${index}`,
      templateId: PLANTED.uuid,
      name: "Cook dinner",
      choreDate: WEEK,
      slot: "any",
      effortPoints: 30,
      durationMin: 60,
      scope: "house",
      roomId: index === 0 ? PLANTED.roomName : null,
      requiresCookingSkill: false,
      isHeavy: false,
    }));

    return buildSchedulePayload({
      weekStart: WEEK,
      instances,
      members,
      windowsByMember: new Map(members.map((member) => [member.memberId, windows([WEEK])])),
      targets: new Map(members.map((member) => [member.memberId, 60])),
      baselineMaxDeviation: 10,
      // A full name goes in; a first name is the most that may come out.
      names: new Map([
        [members[0].memberId, `Ravi ${PLANTED.surname}`],
        [members[1].memberId, `Meena ${PLANTED.surname}`],
      ]),
      canCookByMember: new Map(members.map((member) => [member.memberId, true])),
      roomByMember: new Map([[members[0].memberId, PLANTED.roomName]]),
      awayDatesByMember: new Map(),
      history: [{ memberId: members[0].memberId, chore: "Cook dinner", weeksAgo: 1 }],
      guests: [
        {
          guestId: PLANTED.uuid,
          name: `Bharath ${PLANTED.surname}`,
          hostMemberId: members[0].memberId,
          dates: [WEEK],
        },
      ],
    }).payload;
  }

  it("emits no identifier with a recognisable shape", () => {
    expect(findForbidden(build())).toEqual([]);
  });

  it("emits none of the planted values, surnames and room names included", () => {
    expect(findPlanted(build(), PLANTED)).toEqual([]);
  });

  it("still says enough to be worth asking — the first names survive", () => {
    const text = JSON.stringify(build());
    expect(text).toContain("Ravi");
    expect(text).toContain("Meena");
  });
});

describe("call site 2 — the digest payload", () => {
  function build() {
    return buildDigestPayload({
      weekStart: WEEK,
      weekEnd: "2026-08-30",
      members: [
        {
          memberId: PLANTED.uuid,
          displayName: `Ravi ${PLANTED.surname}`,
          earned: 50,
          target: 60,
          done: 4,
          missed: 1,
          lastWeekEarned: 40,
        },
        {
          memberId: SECOND_UUID,
          displayName: `Meena ${PLANTED.surname}`,
          earned: 70,
          target: 60,
          done: 6,
          missed: 0,
          lastWeekEarned: 65,
        },
      ],
      nextWeek: [{ memberId: PLANTED.uuid, newTarget: 55, note: "eased off" }],
    });
  }

  it("emits no identifier with a recognisable shape", () => {
    expect(findForbidden(build())).toEqual([]);
  });

  it("emits none of the planted values", () => {
    expect(findPlanted(build(), PLANTED)).toEqual([]);
  });

  it("keeps the first names, which is what a summary is written from", () => {
    const text = JSON.stringify(build());
    expect(text).toContain("Ravi");
    expect(text).toContain("Meena");
  });
});

describe("call site 6 — the food normalisation payload", () => {
  // Section 4 permits food names explicitly: a dish is not personal data. What
  // it does not permit is the library's identifiers riding along with them.
  const library = [
    { id: PLANTED.uuid, name: "Paruppu Sadham", timesEaten: 12 },
    { id: SECOND_UUID, name: "Tomato Rice", timesEaten: 9 },
  ];

  it("emits no identifier with a recognisable shape", () => {
    expect(findForbidden(foodNormalisePayload("Parupu Rice", library))).toEqual([]);
  });

  it("emits none of the planted values", () => {
    expect(findPlanted(foodNormalisePayload("Parupu Rice", library), PLANTED)).toEqual([]);
  });

  it("sends the dish names, which are the whole question", () => {
    const text = JSON.stringify(foodNormalisePayload("Parupu Rice", library));
    expect(text).toContain("Paruppu Sadham");
    expect(text).toContain("Parupu Rice");
  });
});

describe("the detectors themselves", () => {
  // A test that cannot fail is worse than no test, so: prove each half fires.
  it("findForbidden catches a uuid, an email and a long number", () => {
    expect(findForbidden({ a: PLANTED.uuid })).toEqual(["uuid"]);
    expect(findForbidden({ a: PLANTED.email })).toContain("email");
    expect(findForbidden({ a: PLANTED.phone })).toContain("long number");
  });

  it("findPlanted names every planted value it finds, and only those", () => {
    expect(findPlanted({ note: `paid ${PLANTED.surname}` }, PLANTED)).toEqual(["surname"]);
    expect(findPlanted({ note: "nothing to see" }, PLANTED)).toEqual([]);
    expect(findPlanted({ a: PLANTED.houseName, b: PLANTED.street }, PLANTED).sort()).toEqual([
      "houseName",
      "street",
    ]);
  });

  it("findPlanted ignores an empty planted value, which would match everything", () => {
    expect(findPlanted({ note: "anything" }, { blank: "" })).toEqual([]);
  });
});
