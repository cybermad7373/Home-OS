import type { DecisionLevel, Requirement } from "./types";

/**
 * What a proposer is told before they ask — docs/08-UI-UX-SPEC.md S-37.
 *
 * The sheet has to say three things before somebody commits to asking the
 * Home: who will be asked, how many of them have to answer, and how long they
 * have. All three are derived from the requirement the selector produced, so
 * they are computed here, over plain values, rather than assembled in JSX where
 * nothing can test them.
 */

/** The slice of a `Requirement` the sheet needs. Names are added by the caller. */
export interface ProposalAsk {
  level: DecisionLevel;
  participantCount: number;
  requiredApprovals: number;
  requiredAcks: number;
  deadlineHours: number | null;
  autoApprove: boolean;
}

export function askFrom(requirement: Requirement): ProposalAsk {
  return {
    level: requirement.level,
    participantCount: requirement.participants.length,
    requiredApprovals: requirement.requiredApprovals,
    requiredAcks: requirement.requiredAcks,
    deadlineHours: requirement.deadlineHours,
    autoApprove: requirement.autoApprove,
  };
}

/** Critical decisions carry a reason into the permanent record (spec §3). */
export function reasonRequired(level: DecisionLevel): boolean {
  return level === "critical";
}

/**
 * "2 approvals and 1 acknowledgement" — the counts, in words, or null when
 * there is nothing to collect because there is nobody to ask.
 */
export function responsesPhrase(ask: ProposalAsk): string | null {
  const parts: string[] = [];
  if (ask.requiredApprovals > 0) {
    parts.push(
      ask.requiredApprovals === 1 ? "1 approval" : `${ask.requiredApprovals} approvals`,
    );
  }
  if (ask.requiredAcks > 0) {
    parts.push(
      ask.requiredAcks === 1
        ? "1 acknowledgement"
        : `${ask.requiredAcks} acknowledgements`,
    );
  }
  if (parts.length === 0) return null;
  return parts.join(" and ");
}

/**
 * How long the people asked have to answer.
 *
 * Days once it divides evenly, because "7 days" is what the policy is written
 * in and "168 hours" is the same fact in a form nobody thinks in. Null means it
 * sits until answered, which is right for an expense and is said as such rather
 * than shown as a blank deadline.
 */
export function deadlinePhrase(hours: number | null): string | null {
  if (hours === null || hours <= 0) return null;
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "1 day" : `${days} days`;
  }
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/**
 * The one line S-37 must always show, in the two forms it can take.
 *
 * A one-person Home is told the truth — there is nobody to ask, and it takes
 * effect now — rather than the reassurance written for every other Home, which
 * would be false there.
 */
export function expectationLine(ask: ProposalAsk): string {
  if (ask.autoApprove) {
    return "There is nobody else here to ask, so this takes effect as soon as you propose it. It is recorded either way.";
  }
  return "Nothing changes until they respond.";
}

/**
 * E-84 — a draw for more than the pot holds, refused before anybody is asked.
 *
 * The database refuses it too, under `for update`, because a decision approved
 * on Tuesday can be applied on Friday after another draw has emptied the pot
 * (BR-283). The two checks answer different questions and neither replaces the
 * other: this one stops the Home being asked to approve something that cannot
 * happen, and that one stops it happening when it no longer can.
 *
 * Returns the sentence to show, with the balance in it, or null when the draw
 * is fine. The balance is shown because "not enough" without a figure sends the
 * proposer to another screen to find out how much is.
 */
export function reserveDrawRefusal(
  balancePaise: number,
  amountPaise: number,
): string | null {
  if (amountPaise <= 0) return "A draw has to be for more than nothing.";
  if (amountPaise <= balancePaise) return null;

  return `The reserve holds ${rupees(balancePaise)} and this draw is for ${rupees(amountPaise)}.`;
}

/** Paise as a plain rupee string. Money crosses into words only here. */
function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
