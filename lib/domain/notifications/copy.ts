import type { NotificationType } from "./catalogue";

/**
 * Notification copy — docs/11-NOTIFICATIONS-SPEC.md section 2, verbatim.
 *
 * The spec writes every string with `{braces}`, so the templates are stored
 * that way and substituted here rather than being reassembled in thirty
 * different call sites. A missing variable throws instead of rendering
 * "You have {n} chores", because a notification is the one surface where a
 * bug is visible to every member of the house at once.
 */

export interface Template {
  title: string;
  body: string;
  /** Where tapping it goes. Also substituted. */
  deepLink: string;
}

export const TEMPLATES: Record<NotificationType, Template> = {
  "N-01": {
    title: "Next week's chores are up",
    body: "You have {n} chores, {points} points. First one: {chore}, {day}.",
    deepLink: "/chores/mine",
  },
  "N-02": {
    title: "{chore} — {time}",
    body: "{points} points. Window: {start} to {end}.",
    deepLink: "/chores/mine",
  },
  "N-03": {
    title: "{chore} still pending",
    body: "Due by {deadline}. {points} points.",
    deepLink: "/chores/mine",
  },
  "N-04": {
    title: "You've been given {chore}",
    body: "{day}, {slot}. {points} points. Assigned by {admin}.",
    deepLink: "/chores/mine",
  },
  "N-05": {
    title: "{chore} moved to {name}",
    body: "You no longer have this one.",
    deepLink: "/chores/mine",
  },
  "N-06": {
    title: "{name} did {chore}",
    body: "Confirm it, or it auto-confirms in {hours}h.",
    deepLink: "/chores/confirmations",
  },
  "N-07": {
    title: "{points} points added",
    body: "{confirmer} confirmed {chore}. You're at {earned} of {target} this week.",
    deepLink: "/chores/mine",
  },
  "N-08": {
    title: "{points} points added",
    body: "{chore} auto-confirmed — nobody responded in {hours}h.",
    deepLink: "/chores/mine",
  },
  "N-09": {
    title: "{chore} was rejected",
    body: "{rejecter}: \"{reason}\" — you have until {deadline} to redo it.",
    deepLink: "/chores/mine",
  },
  "N-10": {
    title: "{name} redid {chore}",
    body: "Confirmed by {confirmer}.",
    deepLink: "/chores",
  },
  "N-11": {
    title: "{chore} missed",
    body: "0 points. You're {deficit} points behind this week.",
    deepLink: "/chores/mine",
  },
  "N-12": {
    title: "{name} missed {chore}",
    body: "{points} points unearned. Currently {deficit} behind.",
    deepLink: "/chores/standing",
  },
  "N-13": {
    title: "You're {deficit} points behind",
    body: "At month end that's about ₹{amount}. {n} chores left this week.",
    deepLink: "/chores/mine",
  },
  "N-14": {
    title: "{name} wants to swap {chore}",
    body: "{day}, {points} points. \"{message}\"",
    deepLink: "/chores/mine",
  },
  "N-15": {
    title: "{name} took {chore}",
    body: "The {points} points go to them.",
    deepLink: "/chores/mine",
  },
  "N-16": {
    title: "{name} declined {chore}",
    body: "It's still yours — {day}, {deadline}.",
    deepLink: "/chores/mine",
  },
  "N-17": {
    title: "{chore} is up for grabs",
    body: "{points} points, {day}. First to claim it gets them.",
    deepLink: "/chores/pool",
  },
  "N-18": {
    title: "{name} added ₹{amount}",
    body: "{category} — needs approval. Your share: ₹{share}.",
    deepLink: "/expenses/approvals",
  },
  "N-19": {
    title: "₹{amount} approved",
    body: "Approved by {approver}.",
    deepLink: "/expenses",
  },
  "N-20": {
    title: "₹{amount} rejected",
    body: "{rejecter}: \"{reason}\"",
    deepLink: "/expenses",
  },
  "N-21": {
    title: "{category} is at {percent}%",
    body: "₹{spent} of ₹{budget} this month.",
    deepLink: "/money/daily",
  },
  "N-22": {
    // Substituted from one of the three variants below before it gets here.
    title: "{month} is settled",
    body: "{outcome}",
    deepLink: "/settle",
  },
  "N-23": {
    title: "{name} says they paid ₹{amount}",
    body: "Confirm when it lands.",
    deepLink: "/settle",
  },
  "N-24": {
    title: "{name} confirmed your ₹{amount}",
    body: "Settled.",
    deepLink: "/settle",
  },
  "N-25": {
    title: "₹{amount} still unsettled",
    body: "{payer} to {receiver}, from {month}.",
    deepLink: "/settle",
  },
  "N-26": {
    title: "{month} was reopened",
    body: "{admin} reopened it for a late ₹{amount} expense. New amounts to follow.",
    deepLink: "/settle",
  },
  "N-27": {
    title: "{name} joined the house",
    body: "Room {room}. Chores from next week.",
    deepLink: "/house/members",
  },
  "N-28": {
    title: "{host} has a guest: {name}",
    body: "{from} to {to}. Counts for shared costs.",
    deepLink: "/house/guests",
  },
  "N-29": {
    title: "This week in the house",
    body: "{summary}",
    deepLink: "/chores/standing",
  },
  "N-30": {
    title: "{n} chores couldn't be assigned",
    body: "Nobody is available for them. Tap to fix.",
    deepLink: "/admin/schedule",
  },
  // Phase 9. Sent once, to admins only, when the house's own AI key is
  // rejected by its provider — docs/10-LLM-SPEC.md section 3.6.
  "N-31": {
    title: "The AI key was rejected",
    body: "{provider} refused it. AI features are off until it's replaced.",
    deepLink: "/admin/settings/ai",
  },

  // 2.8 — governance. `{action}` is the verb phrase for the decision's type;
  // `DECISION_ACTION_PHRASE` in lib/types/domain.ts holds them, and
  // `decision_action_phrase` in migration 055 holds the same map for the
  // triggers that render these strings in the database.
  "N-32": {
    title: "{proposer} wants to {action}",
    body: "You need to {verb} this. {n} others too.",
    deepLink: "/more/approvals/{id}",
  },
  "N-33": {
    title: "{action} — 1 day left",
    body: "Nothing happens until you answer.",
    deepLink: "/more/approvals/{id}",
  },
  "N-34": {
    title: "{action}: {outcome}",
    body: "{n} approved, {m} acknowledged.",
    deepLink: "/more/decisions",
  },
  "N-35": {
    title: "{name} said no to {action}",
    body: "\"{reason}\"",
    deepLink: "/more/decisions",
  },
  "N-36": {
    title: "{action} lapsed",
    body: "Nobody answered in time. Nothing changed.",
    deepLink: "/more/decisions",
  },
  "N-37": {
    title: "{action} couldn't be done",
    body: "The house agreed, but: {reason}",
    deepLink: "/more/decisions",
  },

  // 2.9 — membership.
  "N-38": {
    title: "{name} wants to join",
    body: "\"{message}\"",
    deepLink: "/house/members",
  },
  "N-39": {
    title: "You're in — {home}",
    body: "Set when you're home, and you're done.",
    deepLink: "/house/availability",
  },
  "N-40": {
    title: "{home} declined your request",
    body: "\"{reason}\"",
    deepLink: "/homes",
  },
  "N-41": {
    title: "{name} joined",
    body: "Chores from next week.",
    deepLink: "/house/members",
  },
  "N-42": {
    title: "{proposer} proposed removing you",
    body: "\"{reason}\" — the house is deciding.",
    deepLink: "/more/decisions",
  },
  "N-43": {
    title: "You're no longer active in {home}",
    body: "₹{amount} is still to settle. You'll stay in the money view until it's clear.",
    deepLink: "/settle",
  },
  "N-44": {
    title: "You're a co-admin of {home}",
    body: "You can now approve day-to-day things and you're needed for the big ones.",
    deepLink: "/house/members",
  },
};

/** The three N-22 bodies. Section 2.6 gives them as one row with a condition. */
export const SETTLEMENT_OUTCOME = {
  owing: "You owe ₹{amount}. Tap to pay.",
  owed: "You're owed ₹{amount}.",
  square: "You're square.",
} as const;

export type SettlementOutcome = keyof typeof SETTLEMENT_OUTCOME;

export type Vars = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Substitutes `{name}` from `vars`. Throws rather than shipping the brace. */
export function fill(template: string, vars: Vars): string {
  return template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null) {
      throw new Error(`Notification copy is missing {${key}}`);
    }
    return String(value);
  });
}

export interface Rendered {
  title: string;
  body: string;
  deepLink: string;
}

/**
 * Renders one notification. `N-22` picks its body from the outcome first, so
 * the caller passes `outcome: "owed"` and an amount rather than a sentence.
 */
export function render(type: NotificationType, vars: Vars): Rendered {
  const template = TEMPLATES[type];
  if (!template) throw new Error(`Unknown notification type: ${type}`);

  if (type === "N-22") {
    const outcome = String(vars.outcome ?? "square") as SettlementOutcome;
    const variant = SETTLEMENT_OUTCOME[outcome];
    if (!variant) throw new Error(`Unknown settlement outcome: ${outcome}`);
    return {
      title: fill(template.title, vars),
      body: fill(variant, outcome === "square" ? vars : vars),
      deepLink: fill(template.deepLink, vars),
    };
  }

  return {
    title: fill(template.title, vars),
    body: fill(template.body, vars),
    deepLink: fill(template.deepLink, vars),
  };
}

/** The digest body is truncated to 180 characters (N-29 in section 2.7). */
export const DIGEST_BODY_LIMIT = 180;

export function truncate(text: string, limit = DIGEST_BODY_LIMIT): string {
  if (text.length <= limit) return text;
  // Cut at a word boundary where one is close, so the ellipsis reads as prose.
  const hard = text.slice(0, limit - 1);
  const lastSpace = hard.lastIndexOf(" ");
  const cut = lastSpace > limit - 30 ? hard.slice(0, lastSpace) : hard;
  return `${cut.trimEnd()}…`;
}
