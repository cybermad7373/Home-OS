/**
 * The notification catalogue — docs/11-NOTIFICATIONS-SPEC.md section 2.
 *
 * Forty-four types, each with the preference that governs it, the priority it
 * carries when the daily cap bites, and the copy it renders. Everything about
 * a notification that is a *decision* lives here as data; everything that is a
 * *side effect* lives in the dispatcher. That split is what makes the copy
 * testable without a database and the dispatcher testable without copy.
 *
 * The type IDs are the spec's own N-01 … N-44 rather than invented names, so a
 * reader can hold this file and the spec side by side and check them off.
 */

export type NotificationType =
  | "N-01" | "N-02" | "N-03" | "N-04" | "N-05"
  | "N-06" | "N-07" | "N-08" | "N-09" | "N-10"
  | "N-11" | "N-12" | "N-13" | "N-14" | "N-15"
  | "N-16" | "N-17" | "N-18" | "N-19" | "N-20"
  | "N-21" | "N-22" | "N-23" | "N-24" | "N-25"
  | "N-26" | "N-27" | "N-28" | "N-29" | "N-30"
  | "N-31"
  // 2.8 and 2.9, new in 2.0 — governance and membership.
  | "N-32" | "N-33" | "N-34" | "N-35" | "N-36"
  | "N-37" | "N-38" | "N-39" | "N-40" | "N-41"
  | "N-42" | "N-43" | "N-44";

/**
 * The preference switches from section 6. `settlement_updates` and `decisions`
 * are in the list for completeness and are refused by `setPrefs` — see
 * `MANDATORY`.
 */
export type PrefCategory =
  | "chore_reminders"
  | "confirmation_requests"
  | "chore_outcomes"
  | "house_activity"
  | "expense_activity"
  | "settlement_updates"
  | "weekly_digest"
  | "decisions"
  | "decision_outcomes"
  | "membership";

/**
 * Section 5's priority order, highest first: settlement, confirmation requests,
 * chore reminders due within the hour, approvals, everything else. Lower
 * numbers win. `IMMINENT_REMINDER` is the promotion a reminder earns when its
 * window is within the hour; a reminder further out sorts as `OTHER`.
 */
export const PRIORITY = {
  SETTLEMENT: 1,
  CONFIRMATION: 2,
  IMMINENT_REMINDER: 3,
  APPROVAL: 4,
  OTHER: 5,
} as const;

export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

export interface CatalogueEntry {
  /** The preference switch that can silence the push. */
  category: PrefCategory;
  /** Base priority. A reminder may be promoted at dispatch time. */
  priority: Priority;
  /** Section 3.2 — settlement is the only family that ignores quiet hours. */
  quietHoursExempt: boolean;
  /** A one-line description, used by the preferences screen and by tests. */
  label: string;
}

/**
 * Preferences that exist but cannot be switched off (section 6), and the same
 * reason twice. A member who has muted the app cannot then claim they were
 * never told they owed money; a Home where a required participant can silence
 * the request and then say nobody asked has a governance model on paper only.
 *
 * The line is exactly that: a notification asking the reader to do something
 * only they can do cannot be muted. `decision_outcomes` is news about somebody
 * else's decision, so it is an ordinary switch.
 */
export const MANDATORY: readonly PrefCategory[] = ["settlement_updates", "decisions"];

export const CATALOGUE: Record<NotificationType, CatalogueEntry> = {
  // 2.1 — assignment and reminder
  "N-01": { category: "chore_reminders", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Next week's chores published" },
  "N-02": { category: "chore_reminders", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "A chore window is about to open" },
  "N-03": { category: "chore_reminders", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "A chore is still pending near its deadline" },
  "N-04": { category: "chore_reminders", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "A chore was assigned to you" },
  "N-05": { category: "chore_reminders", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "A chore moved away from you" },

  // 2.2 — confirmation
  "N-06": { category: "confirmation_requests", priority: PRIORITY.CONFIRMATION, quietHoursExempt: false, label: "Someone marked a chore done" },
  "N-07": { category: "chore_outcomes", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Your chore was confirmed" },
  "N-08": { category: "chore_outcomes", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Your chore auto-confirmed" },
  "N-09": { category: "chore_outcomes", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Your chore was rejected" },
  "N-10": { category: "chore_outcomes", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "A rejected chore was redone" },

  // 2.3 — misses and escalation
  "N-11": { category: "chore_outcomes", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "You missed a chore" },
  "N-12": { category: "house_activity", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Someone in the house missed a chore" },
  "N-13": { category: "chore_outcomes", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "You are behind on points" },

  // 2.4 — swaps and the pool
  "N-14": { category: "chore_reminders", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Somebody wants to swap with you" },
  "N-15": { category: "chore_reminders", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Your swap was accepted" },
  "N-16": { category: "chore_reminders", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Your swap was declined" },
  "N-17": { category: "house_activity", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "A chore was released to the pool" },

  // 2.5 — money
  "N-18": { category: "expense_activity", priority: PRIORITY.APPROVAL, quietHoursExempt: false, label: "An expense needs approval" },
  "N-19": { category: "expense_activity", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Your expense was approved" },
  "N-20": { category: "expense_activity", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Your expense was rejected" },
  "N-21": { category: "expense_activity", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "A category crossed its budget" },

  // 2.6 — settlement. Exempt from quiet hours, and cannot be switched off.
  "N-22": { category: "settlement_updates", priority: PRIORITY.SETTLEMENT, quietHoursExempt: true, label: "A month was closed" },
  "N-23": { category: "settlement_updates", priority: PRIORITY.SETTLEMENT, quietHoursExempt: true, label: "Somebody says they paid you" },
  "N-24": { category: "settlement_updates", priority: PRIORITY.SETTLEMENT, quietHoursExempt: true, label: "Your payment was confirmed" },
  "N-25": { category: "settlement_updates", priority: PRIORITY.SETTLEMENT, quietHoursExempt: true, label: "A settlement is still outstanding" },
  "N-26": { category: "settlement_updates", priority: PRIORITY.SETTLEMENT, quietHoursExempt: true, label: "A closed month was reopened" },

  // 2.7 — house and digest
  "N-27": { category: "house_activity", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "A new member joined" },
  "N-28": { category: "house_activity", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "A guest was registered" },
  "N-29": { category: "weekly_digest", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "The weekly digest" },
  "N-30": { category: "house_activity", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Chores could not be assigned" },

  // Phase 9 — docs/10-LLM-SPEC.md section 3.6. Admin-only, once per rejected
  // key: an administrative fact about a credential, not house news.
  "N-31": { category: "house_activity", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "The house AI key was rejected" },

  // 2.8 — governance. A decision waiting on the reader is an approval and
  // sorts at 4; a decision that has already happened is news and sorts at 5.
  // Only N-33 ignores quiet hours: section 6 exempts a decision with a
  // deadline inside 24 hours, and N-33 is the one sent inside that window.
  "N-32": { category: "decisions", priority: PRIORITY.APPROVAL, quietHoursExempt: false, label: "A decision needs your response" },
  "N-33": { category: "decisions", priority: PRIORITY.APPROVAL, quietHoursExempt: true, label: "A decision deadline is approaching" },
  "N-34": { category: "decision_outcomes", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "A decision resolved" },
  "N-35": { category: "decisions", priority: PRIORITY.APPROVAL, quietHoursExempt: false, label: "Your decision was rejected" },
  "N-36": { category: "decisions", priority: PRIORITY.APPROVAL, quietHoursExempt: false, label: "A decision lapsed" },
  "N-37": { category: "decisions", priority: PRIORITY.APPROVAL, quietHoursExempt: false, label: "A decision was approved and could not be applied" },

  // 2.9 — membership. N-41 is house news and sits under house activity, which
  // is where section 6 puts it.
  "N-38": { category: "membership", priority: PRIORITY.APPROVAL, quietHoursExempt: false, label: "Somebody asked to join" },
  "N-39": { category: "membership", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Your request was accepted" },
  "N-40": { category: "membership", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "Your request was declined" },
  "N-41": { category: "house_activity", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "A new member joined" },
  "N-42": { category: "decisions", priority: PRIORITY.APPROVAL, quietHoursExempt: false, label: "Your removal was proposed" },
  "N-43": { category: "decisions", priority: PRIORITY.APPROVAL, quietHoursExempt: false, label: "You are inactive, pending settlement" },
  "N-44": { category: "membership", priority: PRIORITY.OTHER, quietHoursExempt: false, label: "You were made a co-admin" },
};

export function entryFor(type: NotificationType): CatalogueEntry {
  const entry = CATALOGUE[type];
  if (!entry) throw new Error(`Unknown notification type: ${type}`);
  return entry;
}

/** True when the member's preferences allow a push for this type. */
export function pushAllowed(
  type: NotificationType,
  prefs: Partial<Record<PrefCategory, boolean>>,
): boolean {
  const { category } = entryFor(type);
  if (MANDATORY.includes(category)) return true;
  return prefs[category] !== false;
}

/**
 * The preference switch never suppresses the feed row — section 1: "Every
 * notification is written here regardless of push outcome. The feed is the
 * record." This function exists so that intent is stated once, in the domain,
 * rather than being an absence of a check in three call sites.
 */
export function feedRowAlwaysWritten(): true {
  return true;
}
