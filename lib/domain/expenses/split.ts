/**
 * The split calculator.
 *
 * Pure: plain data in, plain data out, no database and no framework. This is
 * where the correctness of every rupee in the app lives, which is why it is
 * testable without any of the rest of it (docs/03-ARCHITECTURE.md principle 2,
 * NFR-14).
 *
 * The one invariant that must never break: **shares sum exactly to the expense
 * amount**, for any amount and any head count (NFR-08, BR-092). Everything else
 * here is in service of that.
 */

export type SplitBasis = "equal" | "room_rent" | "custom" | "payer";

export interface SplitParticipant {
  /** The house_members id — also the tie-break for remainder distribution. */
  memberId: string;
  /** Inclusive. A member is a participant when the expense date falls inside. */
  joinedDate: string;
  leftDate: string | null;
  /**
   * Whether this resident carries a share of the house's money. False for a
   * dependent — a child, an elderly parent — who eats the groceries and does
   * not pay for them. Absent means true, so every existing caller is unchanged.
   */
  sharesCost?: boolean;
  /**
   * Who picks up a non-paying resident's share. Exactly the relationship a
   * guest has to their host, and it goes through the same arithmetic.
   */
  guardianMemberId?: string | null;
}

export interface SplitRoom {
  roomId: string;
  monthlyRentPaise: number;
  /** Members occupying the room on the expense date. */
  occupantMemberIds: string[];
}

/** Phase 5 fills these in. Phase 2 always passes an empty list. */
export interface SplitGuest {
  guestId: string;
  hostMemberId: string;
  countsForExpense: boolean;
  fromDate: string;
  toDate: string;
}

export interface SplitShare {
  memberId: string;
  sharePaise: number;
  guestSharePaise: number;
  /** A dependent's head, billed to the guardian whose row this is. */
  dependentSharePaise: number;
  basisNote?: string;
}

export interface SplitInput {
  amountPaise: number;
  expenseDate: string;
  basis: SplitBasis;
  members: SplitParticipant[];
  rooms?: SplitRoom[];
  guests?: SplitGuest[];
  /** Required when basis is "custom": explicit paise per member. */
  customShares?: { memberId: string; sharePaise: number }[];
  /** Required when basis is "payer". The member whose money it was. */
  paidByMemberId?: string;
}

export class SplitError extends Error {
  readonly code:
    | "NO_PARTICIPANTS"
    | "CUSTOM_MISMATCH"
    | "CUSTOM_NEGATIVE"
    | "CUSTOM_UNKNOWN_MEMBER"
    | "NO_OCCUPIED_ROOMS"
    | "PAYER_REQUIRED"
    | "PAYER_NOT_A_MEMBER";
  readonly details?: Record<string, unknown>;

  constructor(code: SplitError["code"], message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "SplitError";
    this.code = code;
    this.details = details;
  }
}

/**
 * BR-005 — membership is dated, so an expense splits against the household as
 * it stood on the expense date, not as it stands today. This is what makes a
 * July expense discovered in August still bill the person who moved out.
 */
export function isActiveOn(member: SplitParticipant, date: string): boolean {
  if (member.joinedDate > date) return false;
  if (member.leftDate !== null && member.leftDate < date) return false;
  return true;
}

export function participantsOn(
  members: SplitParticipant[],
  date: string,
): SplitParticipant[] {
  // Sorted by id: the remainder distribution below has to be deterministic, and
  // "whatever order the database returned" is not.
  return members
    .filter((member) => isActiveOn(member, date))
    .sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
}

/**
 * The participants who carry money. A house of eight flatmates is all of them;
 * a family of two parents and three children is the two parents.
 */
export function payersAmong(participants: SplitParticipant[]): SplitParticipant[] {
  return participants.filter((member) => member.sharesCost !== false);
}

/**
 * Walks up the guardian chain to the first person who actually pays, so a
 * grandchild in the care of a teenager in the care of a parent still lands on
 * the parent. Returns null when the chain leads nowhere — a guardian who has
 * moved out, or a cycle — and the caller then leaves that head out of the count
 * entirely rather than charging it to nobody.
 */
function carrierFor(
  member: SplitParticipant,
  byId: Map<string, SplitParticipant>,
  payerIds: Set<string>,
): string | null {
  const seen = new Set<string>([member.memberId]);
  let guardianId = member.guardianMemberId ?? null;

  while (guardianId !== null && !seen.has(guardianId)) {
    if (payerIds.has(guardianId)) return guardianId;
    seen.add(guardianId);
    guardianId = byId.get(guardianId)?.guardianMemberId ?? null;
  }
  return null;
}

export function guestsOn(guests: SplitGuest[], date: string): SplitGuest[] {
  return guests
    .filter(
      (guest) =>
        guest.countsForExpense && guest.fromDate <= date && date <= guest.toDate,
    )
    .sort((a, b) => (a.guestId < b.guestId ? -1 : a.guestId > b.guestId ? 1 : 0));
}

/**
 * BR-093 — the rounding remainder is handed out one paisa at a time, in
 * ascending member-id order. Never dropped, never duplicated. This loop is the
 * entire reason the sums come out exact.
 */
function distributeRemainder(
  ids: string[],
  remainder: number,
  add: (memberId: string, paise: number) => void,
): void {
  for (let index = 0; index < remainder; index += 1) {
    add(ids[index % ids.length], 1);
  }
}

/**
 * The default. Equal across every head in the house on the date — the members
 * who pay, plus the dependents and guests they are answerable for, whose shares
 * land on them.
 */
export function splitEqual(input: SplitInput): SplitShare[] {
  const participants = participantsOn(input.members, input.expenseDate);
  const payers = payersAmong(participants);
  if (payers.length === 0) {
    throw new SplitError(
      "NO_PARTICIPANTS",
      "Nobody who pays a share was a member of the house on that date",
      { expenseDate: input.expenseDate },
    );
  }

  const payerIds = new Set(payers.map((payer) => payer.memberId));
  const byId = new Map(participants.map((member) => [member.memberId, member]));

  // A head only counts if somebody is on the hook for it. Counting a head whose
  // carrier has moved out inflates the divisor and leaves that head's base paise
  // charged to nobody, which breaks the exact-sum invariant — the arithmetic
  // stops adding up to the amount, and computeSplit throws at the end.
  const guests = guestsOn(input.guests ?? [], input.expenseDate).filter((guest) =>
    payerIds.has(guest.hostMemberId),
  );

  const dependents = participants
    .filter((member) => member.sharesCost === false)
    .map((member) => ({ member, carrier: carrierFor(member, byId, payerIds) }))
    .filter(
      (entry): entry is { member: SplitParticipant; carrier: string } =>
        entry.carrier !== null,
    );

  const heads = payers.length + guests.length + dependents.length;
  const base = Math.floor(input.amountPaise / heads);
  const remainder = input.amountPaise - base * heads;

  const shares = new Map<string, SplitShare>(
    payers.map((payer) => [
      payer.memberId,
      {
        memberId: payer.memberId,
        sharePaise: base,
        guestSharePaise: 0,
        dependentSharePaise: 0,
      },
    ]),
  );

  // BR-095 — a guest's head is billed to their host, and recorded separately so
  // the host can see exactly what they are paying for. A dependent's head works
  // the same way, on its own column so the two can be told apart on a receipt.
  for (const guest of guests) {
    const host = shares.get(guest.hostMemberId);
    if (host) host.guestSharePaise += base;
  }
  for (const entry of dependents) {
    const guardian = shares.get(entry.carrier);
    if (guardian) guardian.dependentSharePaise += base;
  }

  distributeRemainder(
    payers.map((payer) => payer.memberId),
    remainder,
    (memberId, paise) => {
      const share = shares.get(memberId);
      if (share) share.sharePaise += paise;
    },
  );

  return [...shares.values()];
}

/**
 * Pot mode. The whole amount sits on the member who paid it, so the expense is
 * recorded, categorised and budgeted against without creating a claim on
 * anybody. Netting a month of these produces no payments at all, which is the
 * entire point: a family logs what the house spent, not what Amma owes Appa.
 */
export function splitPayer(input: SplitInput): SplitShare[] {
  const payerId = input.paidByMemberId;
  if (!payerId) {
    throw new SplitError(
      "PAYER_REQUIRED",
      "A payer-basis split needs to know who paid",
    );
  }

  const participants = participantsOn(input.members, input.expenseDate);
  if (!participants.some((member) => member.memberId === payerId)) {
    throw new SplitError(
      "PAYER_NOT_A_MEMBER",
      "The payer was not a member of the house on that date",
      { memberId: payerId, expenseDate: input.expenseDate },
    );
  }

  return [
    {
      memberId: payerId,
      sharePaise: input.amountPaise,
      guestSharePaise: 0,
      dependentSharePaise: 0,
    },
  ];
}

/**
 * Rent. Each room's rent divides among its occupants on the date; a vacant
 * room's rent is a house cost split equally across everybody.
 *
 * That last part is deliberate (docs/06-ALGORITHMS.md section 3.2): the house
 * owes the landlord whether or not the room is full, and making the remaining
 * occupants of a half-empty room absorb it would punish them for somebody
 * else's departure.
 */
export function splitRoomRent(input: SplitInput): SplitShare[] {
  // Only the people who pay divide a rent. A child sharing their parents' room
  // does not halve that room's rent, and a room occupied by children alone is a
  // vacant room as far as the money is concerned — which the rule below already
  // handles by spreading it across the house.
  const participants = payersAmong(participantsOn(input.members, input.expenseDate));
  if (participants.length === 0) {
    throw new SplitError(
      "NO_PARTICIPANTS",
      "Nobody who pays a share was a member of the house on that date",
    );
  }

  const rooms = input.rooms ?? [];
  const totalRent = rooms.reduce((sum, room) => sum + room.monthlyRentPaise, 0);
  if (totalRent === 0) {
    throw new SplitError(
      "NO_OCCUPIED_ROOMS",
      "No rooms with rent are set up, so there is nothing to split by room",
    );
  }

  const active = new Set(participants.map((participant) => participant.memberId));
  const shares = new Map<string, SplitShare>(
    participants.map((participant) => [
      participant.memberId,
      {
        memberId: participant.memberId,
        sharePaise: 0,
        guestSharePaise: 0,
        dependentSharePaise: 0,
      },
    ]),
  );

  let vacantRentPaise = 0;

  for (const room of [...rooms].sort((a, b) => (a.roomId < b.roomId ? -1 : 1))) {
    const occupants = [...room.occupantMemberIds]
      .filter((memberId) => active.has(memberId))
      .sort();

    if (occupants.length === 0) {
      vacantRentPaise += room.monthlyRentPaise;
      continue;
    }

    const base = Math.floor(room.monthlyRentPaise / occupants.length);
    const remainder = room.monthlyRentPaise - base * occupants.length;

    for (const memberId of occupants) {
      const share = shares.get(memberId);
      if (share) share.sharePaise += base;
    }
    distributeRemainder(occupants, remainder, (memberId, paise) => {
      const share = shares.get(memberId);
      if (share) share.sharePaise += paise;
    });
  }

  // BR-013 — vacant rent, plus whatever the expense is above or below the sum
  // of the rents, rides on everybody equally. The scaling matters: the rent
  // expense actually logged may differ from the configured rents.
  const spreadEqually = input.amountPaise - (totalRent - vacantRentPaise);
  if (spreadEqually !== 0) {
    const ids = participants.map((participant) => participant.memberId);
    const base = Math.floor(spreadEqually / ids.length);
    const remainder = spreadEqually - base * ids.length;

    for (const memberId of ids) {
      const share = shares.get(memberId);
      if (share) share.sharePaise += base;
    }
    distributeRemainder(ids, Math.abs(remainder), (memberId, paise) => {
      const share = shares.get(memberId);
      if (share) share.sharePaise += remainder < 0 ? -paise : paise;
    });
  }

  return [...shares.values()];
}

/** BR-094 — explicit amounts, validated hard: known members, no negatives, exact sum. */
export function splitCustom(input: SplitInput): SplitShare[] {
  const custom = input.customShares ?? [];
  const participants = payersAmong(participantsOn(input.members, input.expenseDate));
  const active = new Set(participants.map((participant) => participant.memberId));

  for (const entry of custom) {
    if (!active.has(entry.memberId)) {
      throw new SplitError(
        "CUSTOM_UNKNOWN_MEMBER",
        "A custom split can only name members of the house on that date",
        { memberId: entry.memberId },
      );
    }
    if (entry.sharePaise < 0) {
      throw new SplitError("CUSTOM_NEGATIVE", "A share cannot be negative", {
        memberId: entry.memberId,
      });
    }
  }

  const total = custom.reduce((sum, entry) => sum + entry.sharePaise, 0);
  if (total !== input.amountPaise) {
    throw new SplitError(
      "CUSTOM_MISMATCH",
      "The shares do not add up to the amount",
      { difference: input.amountPaise - total, total, amount: input.amountPaise },
    );
  }

  return custom.map((entry) => ({
    memberId: entry.memberId,
    sharePaise: entry.sharePaise,
    guestSharePaise: 0,
    dependentSharePaise: 0,
  }));
}

/** The one entry point the API uses. */
export function computeSplit(input: SplitInput): SplitShare[] {
  const shares =
    input.basis === "custom"
      ? splitCustom(input)
      : input.basis === "room_rent"
        ? splitRoomRent(input)
        : input.basis === "payer"
          ? splitPayer(input)
          : splitEqual(input);

  // The database enforces this too, deferred, at commit. Checking here as well
  // turns a corrupted balance into a loud failure at the point of the bug.
  const total = shares.reduce(
    (sum, share) =>
      sum + share.sharePaise + share.guestSharePaise + share.dependentSharePaise,
    0,
  );
  if (total !== input.amountPaise) {
    throw new Error(
      `Split calculator produced ${total} paise for an expense of ${input.amountPaise}`,
    );
  }

  return shares;
}

/** What the add-expense sheet shows live under the button. */
export function summariseSplit(
  shares: SplitShare[],
  memberId: string,
  /** Heads that are not themselves rows in the split: guests and dependents. */
  carriedHeads = 0,
): { yourSharePaise: number; heads: number; carriedHeads: number } {
  const mine = shares.find((share) => share.memberId === memberId);
  return {
    yourSharePaise:
      (mine?.sharePaise ?? 0) +
      (mine?.guestSharePaise ?? 0) +
      (mine?.dependentSharePaise ?? 0),
    heads: shares.length + carriedHeads,
    carriedHeads,
  };
}
