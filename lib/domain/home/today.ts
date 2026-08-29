/**
 * Today's pure layer — S-50.
 *
 * Today is a composition: presence from absences, chores from assignments,
 * money from expenses, food from the recommender, announcements from their own
 * table. None of that is a decision. Two things are:
 *
 *   * **what "Needs you" contains and in what order.** Three different queues
 *     merge into one list, and a wrong order means the Home works through the
 *     cheap items while a Critical decision sits unanswered.
 *   * **who counts as home and who counts as away** on a given date.
 *
 * Both live here, framework- and database-free.
 */

export type NeedsYouKind = "decision" | "confirmation" | "approval";

export interface NeedsYouItem {
  kind: NeedsYouKind;
  id: string;
  /** The line the row leads with. */
  title: string;
  /** The second line: quorum progress, who paid, how long it has waited. */
  detail: string;
  href: string;
  /** Critical decisions carry the ⚠ mark (S-50). */
  critical: boolean;
  /** When the thing that needs answering happened. Older is more urgent. */
  since: string;
}

export interface DecisionNeed {
  id: string;
  label: string;
  level: string;
  createdAt: string;
  approvalsGiven: number;
  approvalsRequired: number;
}

export interface ConfirmationNeed {
  id: string;
  choreName: string;
  assigneeName: string;
  doneAt: string | null;
  createdAt: string;
  received: number;
  required: number;
}

export interface ApprovalNeed {
  id: string;
  description: string;
  payerName: string;
  amountLabel: string;
  createdAt: string;
}

/** Rank by kind first; ties inside a kind break to whichever waited longest. */
const RANK: Record<NeedsYouKind, number> = {
  decision: 0,
  confirmation: 1,
  approval: 2,
};

/**
 * The merged queue.
 *
 * The order is deliberate and is not "newest first". A Critical decision is
 * above everything, because it is the only item that can hold the whole Home
 * still and the only one the product exists to protect. Then the rest of the
 * decisions; then confirmations, which hold one person's points; then expense
 * approvals, which hold one expense. Within any group the one that has waited
 * longest comes first, because that is the one closest to lapsing.
 */
export function needsYou(input: {
  decisions: DecisionNeed[];
  confirmations: ConfirmationNeed[];
  approvals: ApprovalNeed[];
}): NeedsYouItem[] {
  const items: NeedsYouItem[] = [
    ...input.decisions.map((decision) => ({
      kind: "decision" as const,
      id: decision.id,
      title: decision.label,
      detail:
        decision.approvalsRequired > 0
          ? `${decision.approvalsGiven} of ${decision.approvalsRequired} approvals`
          : "Waiting on you",
      href: `/more/approvals/${decision.id}`,
      critical: decision.level === "critical",
      since: decision.createdAt,
    })),
    ...input.confirmations.map((confirmation) => ({
      kind: "confirmation" as const,
      id: confirmation.id,
      title: `${confirmation.assigneeName} — ${confirmation.choreName}`,
      // Quorum progress, so confirming reads as contributing rather than as a
      // rubber stamp (S-50).
      detail: `${confirmation.received} of ${confirmation.required} confirmations`,
      href: "/chores",
      critical: false,
      since: confirmation.doneAt ?? confirmation.createdAt,
    })),
    ...input.approvals.map((approval) => ({
      kind: "approval" as const,
      id: approval.id,
      title: `${approval.description} — ${approval.payerName}`,
      detail: `${approval.amountLabel} · waiting for your approval`,
      href: "/expenses/approvals",
      critical: false,
      since: approval.createdAt,
    })),
  ];

  return items.sort((a, b) => {
    if (a.critical !== b.critical) return a.critical ? -1 : 1;
    if (RANK[a.kind] !== RANK[b.kind]) return RANK[a.kind] - RANK[b.kind];
    return a.since < b.since ? -1 : a.since > b.since ? 1 : 0;
  });
}

export interface PresenceMember {
  memberId: string;
  displayName: string;
}

export interface PresenceAbsence {
  memberId: string;
  fromDate: string;
  toDate: string;
  status: string;
}

export interface Presence {
  home: PresenceMember[];
  away: { memberId: string; displayName: string; reason: "absence" }[];
}

/**
 * Who is here on a date.
 *
 * Only an **approved** absence makes somebody away. One still being decided is
 * a request, not a fact, and showing the person as away before the Home has
 * answered would make the decision pointless — the same rule the chore
 * scheduler applies (AV-06).
 */
export function presenceOn(
  date: string,
  members: PresenceMember[],
  absences: PresenceAbsence[],
): Presence {
  const awayIds = new Set(
    absences
      .filter(
        (absence) =>
          absence.status === "approved" &&
          absence.fromDate <= date &&
          absence.toDate >= date,
      )
      .map((absence) => absence.memberId),
  );

  return {
    home: members.filter((member) => !awayIds.has(member.memberId)),
    away: members
      .filter((member) => awayIds.has(member.memberId))
      .map((member) => ({ ...member, reason: "absence" as const })),
  };
}

/**
 * The presence line: "5 home · 2 away", or just "5 home" when nobody is away.
 * A "· 0 away" is a fact nobody needs.
 */
export function presenceLabel(presence: Presence): string {
  const home = `${presence.home.length} home`;
  return presence.away.length > 0 ? `${home} · ${presence.away.length} away` : home;
}
