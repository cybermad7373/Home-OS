/**
 * Decisions — the queue, and the four ways one ends.
 *
 * The property this subsystem exists to protect (docs/14-GOVERNANCE-SPEC.md) is
 * that no single member's responses can complete a Critical decision. A demo
 * with an empty `decisions` table cannot show that, so this seeds one Critical
 * decision deliberately short of quorum and leaves it there.
 *
 * The database does most of the work. `resolve_on_response` re-resolves a
 * decision on every response, so the seed inserts responses and lets the
 * quorum maths decide the outcome, exactly as a real house would.
 */
import { admin, insertOne, must } from "./env.mjs";
import { at, addDays, hoursAgo } from "./util.mjs";

/**
 * A decision that has already run its course, written directly.
 *
 * Used where another row needs a decision to point at — a reserve, an expected
 * contribution, a balance adjustment, an activated rule version all carry a
 * `decision_id` that is `not null` on purpose: nothing in this product changes
 * the shape of the money without a recorded decision behind it.
 */
export async function appliedDecision(houseId, requestedBy, spec) {
  const resolvedAt = spec.resolvedAt ?? hoursAgo(72);
  return insertOne("decisions", {
    house_id: houseId,
    type: spec.type,
    level: spec.level ?? "important",
    requested_by: requestedBy,
    subject_type: spec.subjectType ?? null,
    subject_id: spec.subjectId ?? null,
    subject_member_id: spec.subjectMemberId ?? null,
    payload: spec.payload ?? {},
    reason: spec.reason,
    required_approvals: spec.requiredApprovals ?? 0,
    required_acks: 0,
    status: "applied",
    result: spec.result ?? { applied: true },
    resolved_at: resolvedAt,
    applied_at: resolvedAt,
    created_at: spec.createdAt ?? hoursAgo(96),
  });
}

async function participants(decisionId, memberIds, capacity, mandatoryIds = []) {
  if (memberIds.length === 0) return;
  must(
    "insert decision_participants",
    await admin
      .from("decision_participants")
      .insert(
        memberIds.map((memberId) => ({
          decision_id: decisionId,
          member_id: memberId,
          capacity,
          is_mandatory: mandatoryIds.includes(memberId),
        })),
      )
      .select("id"),
  );
}

async function respond(decisionId, memberId, capacity, response, reason = null) {
  await insertOne("decision_responses", {
    decision_id: decisionId,
    member_id: memberId,
    capacity,
    response,
    reason,
  });
}

export async function seedGovernance(context) {
  const { houseId, memberIds, today, home } = context;
  const [lead, second, third, fourth] = memberIds;
  const others = memberIds.slice(1);

  // ---------------------------------------------------------------- waiting
  // A Critical decision, deliberately one approval short. This is the row the
  // approvals badge counts and the one the whole governance version exists for:
  // it cannot be completed by the person who raised it.
  const critical = await insertOne("decisions", {
    house_id: houseId,
    type: "change_home_mode",
    level: "critical",
    requested_by: lead,
    payload: {
      from: { money_mode: home.settings.money_mode, effort_mode: home.settings.effort_mode },
      to: { money_mode: home.settings.money_mode === "pot" ? "split" : "pot" },
    },
    reason:
      "The pot works when everybody puts in on time and stops working the month somebody does not. Worth a vote rather than an argument.",
    required_approvals: Math.max(2, Math.ceil(others.length * 0.6)),
    required_acks: 0,
    deadline: at(addDays(today, 5), "18:00"),
    created_at: hoursAgo(30),
  });
  await participants(critical.id, others, "approver", [others[0]]);
  // One yes. Short of quorum, and short on purpose.
  await respond(critical.id, second, "approver", "approve");

  // A second waiting decision at a lower level, so the queue is not one row
  // and the level badge has something to distinguish.
  const spending = await insertOne("decisions", {
    house_id: houseId,
    type: "change_rule",
    level: "normal",
    requested_by: second,
    payload: { field: "quiet_hours", from: "23:00", to: "22:30" },
    reason: "Early shifts start at six and the hall is loud until midnight.",
    required_approvals: 2,
    required_acks: 0,
    deadline: at(addDays(today, 3), "18:00"),
    created_at: hoursAgo(8),
  });
  await participants(spending.id, [lead, ...memberIds.slice(2)], "approver");

  // An acknowledgement-only decision: nothing to approve, but everybody has to
  // have seen it. A different shape of row on the same screen.
  const notice = await insertOne("decisions", {
    house_id: houseId,
    type: "change_governance",
    level: "important",
    requested_by: lead,
    payload: { field: "decision_deadline_days", from: 7, to: 5 },
    reason: "Decisions sitting open for a week is how they get forgotten.",
    required_approvals: 0,
    required_acks: Math.max(1, others.length - 1),
    deadline: at(addDays(today, 6), "18:00"),
    created_at: hoursAgo(20),
  });
  await participants(notice.id, others, "acknowledger");
  if (third) await respond(notice.id, third, "acknowledger", "acknowledge");

  // ---------------------------------------------------------------- resolved
  // Approved by quorum, and resolved by the database rather than by this file:
  // the responses go in and `resolve_on_response` does the rest.
  const approved = await insertOne("decisions", {
    house_id: houseId,
    type: "change_confirmation_policy",
    level: "important",
    requested_by: lead,
    payload: { from: "size_aware", to: home.settings.confirmation_policy },
    reason: "Two confirmations on a five-minute job was slowing everything down.",
    required_approvals: 2,
    required_acks: 0,
    // Still inside its deadline. A decision that reaches quorum after the
    // deadline has passed resolves as lapsed, not approved, so the one row
    // meant to show the approved state has to be answered in time.
    deadline: at(addDays(today, 2), "18:00"),
    created_at: hoursAgo(200),
  });
  await participants(approved.id, others, "approver");
  await respond(approved.id, second, "approver", "approve");
  if (third) await respond(approved.id, third, "approver", "approve");

  // Rejected. One veto ends it, and the database insists a rejection carries a
  // reason of at least ten characters — a "no" with no sentence behind it is
  // the thing this product is trying to prevent.
  const rejected = await insertOne("decisions", {
    house_id: houseId,
    type: "remove_member",
    level: "critical",
    requested_by: second,
    subject_member_id: memberIds[memberIds.length - 1],
    payload: { reason: "repeatedly missed chores" },
    reason: "Three months of missed chores and no answer when asked about it.",
    required_approvals: 3,
    required_acks: 0,
    deadline: at(addDays(today, -8), "18:00"),
    created_at: hoursAgo(400),
  });
  // The subject of a decision cannot also vote on it — the database asserts it.
  const voters = memberIds.filter(
    (id) => id !== memberIds[memberIds.length - 1] && id !== second,
  );
  await participants(rejected.id, voters, "approver");
  await respond(
    rejected.id,
    voters[0],
    "approver",
    "reject",
    "Removing somebody over chores before anyone has actually sat down with him is not proportionate.",
  );

  // Lapsed: nobody answered before the deadline. The expiry job would do this
  // hourly; here it is written as the state that job leaves behind.
  const lapsed = await insertOne("decisions", {
    house_id: houseId,
    type: "set_expected_contribution",
    level: "normal",
    requested_by: fourth ?? second,
    payload: { amount_paise: 500_000 },
    reason: "Proposed a fixed monthly amount so the pot stops running dry.",
    required_approvals: 2,
    required_acks: 0,
    deadline: at(addDays(today, -14), "18:00"),
    status: "lapsed",
    resolved_at: at(addDays(today, -14), "18:01"),
    created_at: at(addDays(today, -21), "10:00"),
  });
  await participants(lapsed.id, memberIds.filter((id) => id !== (fourth ?? second)), "approver");

  return { criticalId: critical.id, approvedId: approved.id, rejectedId: rejected.id };
}
