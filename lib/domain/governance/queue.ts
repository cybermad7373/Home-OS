import type { DecisionLevel, DecisionType, ResponseCapacity } from "./types";

/**
 * The Approvals queue, as an arrangement of plain values — S-35 in
 * docs/08-UI-UX-SPEC.md, AP-01 to AP-05 in docs/01-BRD.md.
 *
 * Two rules live here rather than in the screen that renders them:
 *
 *   * **which group a decision belongs to**, so that a new decision type is
 *     one entry in a map rather than a new branch in JSX; and
 *   * **which decisions are held back for a deliberate tap** — the Critical
 *     ones that would complete on this caller's response (AP-04). The screen
 *     must not be the only thing standing between a batch and a settlement
 *     close, so the split is a function with a test.
 *
 * The batch itself is planned server-side by `planApproveAll`, from the same
 * candidates. This module decides what the caller *sees*; that one decides
 * what a tap *does*, and the two agree because the deliberate rule is stated
 * once in each and tested in both.
 */

export type QueueGroup =
  | "expenses"
  | "chores"
  | "absences"
  | "join_requests"
  | "members"
  | "rules"
  | "money"
  | "settlement";

export const GROUP_OF: Record<DecisionType, QueueGroup> = {
  expense_approval: "expenses",
  chore_confirmation: "chores",
  absence_request: "absences",
  join_request: "join_requests",
  remove_member: "members",
  change_home_mode: "members",
  change_rule: "rules",
  change_governance: "rules",
  balance_adjustment: "money",
  set_expected_contribution: "money",
  create_reserve: "money",
  reserve_draw: "money",
  close_settlement: "settlement",
  reopen_settlement: "settlement",
};

/**
 * The order the groups appear in, most frequent first. Expenses and chores are
 * the daily traffic; a settlement close happens once a month and is usually in
 * the deliberate section anyway.
 */
export const GROUP_ORDER: QueueGroup[] = [
  "expenses",
  "chores",
  "absences",
  "join_requests",
  "members",
  "rules",
  "money",
  "settlement",
];

/** What the queue needs of an item, and nothing else. */
export interface QueueItem {
  id: string;
  type: DecisionType;
  level: DecisionLevel;
  /** From the server's own `viewer` block: this response finishes it. */
  completesOnMyResponse: boolean;
}

export interface QueueSection<T extends QueueItem> {
  group: QueueGroup;
  items: T[];
}

export interface QueueSplit<T extends QueueItem> {
  /** Groups with at least one item, in `GROUP_ORDER`. */
  sections: QueueSection<T>[];
  /** Critical and completing on this caller: shown alone, opened not batched. */
  deliberate: T[];
  /** Everything waiting on the caller, batched section and deliberate alike. */
  total: number;
}

/** Whether this item must be answered on its own screen rather than in a batch. */
export function needsDeliberateAction(item: QueueItem): boolean {
  return item.level === "critical" && item.completesOnMyResponse;
}

export function splitQueue<T extends QueueItem>(items: T[]): QueueSplit<T> {
  const deliberate = items.filter(needsDeliberateAction);
  const batchable = items.filter((item) => !needsDeliberateAction(item));

  const sections: QueueSection<T>[] = [];
  for (const group of GROUP_ORDER) {
    const inGroup = batchable.filter((item) => GROUP_OF[item.type] === group);
    if (inGroup.length > 0) sections.push({ group, items: inGroup });
  }

  return { sections, deliberate, total: items.length };
}

/**
 * Whether a decision is still waiting on one particular member.
 *
 * The badge on the tab bar is a count of these (AP-05), and it is computed
 * from three narrow queries rather than by building the whole queue: a person
 * holds a slot they have not answered, on something still open.
 *
 * A decision whose deadline has passed is not waiting on anybody. The hourly
 * job will mark it `lapsed`; until it runs, the count must not ask somebody to
 * answer something their answer can no longer change.
 */
export function awaitsResponse(input: {
  status: string;
  deadline: Date | null;
  capacities: ResponseCapacity[];
  responded: ResponseCapacity[];
  now: Date;
}): boolean {
  if (input.status !== "waiting") return false;
  if (input.deadline && input.deadline.getTime() <= input.now.getTime()) return false;
  return input.capacities.some((capacity) => !input.responded.includes(capacity));
}
