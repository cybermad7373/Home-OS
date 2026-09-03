/**
 * House rules, in the house's own words, with their history.
 *
 * One rule is deliberately on its third version, because the version screen is
 * the only place in the product where a house can see what it used to think —
 * and a rule with a single version has nothing to show there.
 *
 * `activation_requires_decision` means an active version must name the decision
 * that activated it. Rules do not change because somebody edited a text box.
 */
import { admin, insertOne, must } from "./env.mjs";
import { appliedDecision } from "./governance.mjs";
import { addDays, at, hoursAgo } from "./util.mjs";

const RULES = [
  {
    title: "Quiet hours",
    versions: [
      {
        text: "No loud music or TV after 11pm on weeknights.",
        condition: { kind: "time_window", from: "23:00", to: "07:00", days: "weekdays" },
        action: { kind: "warn" },
        changeReason: null,
      },
      {
        text: "No loud music or TV after 11pm on weeknights, or after 1am at weekends.",
        condition: { kind: "time_window", from: "23:00", to: "07:00", weekend_from: "01:00" },
        action: { kind: "warn" },
        changeReason: "Weekends were never really the problem.",
      },
      {
        text: "No loud music or TV after 10:30pm on weeknights, or after 1am at weekends. Headphones after that, please.",
        condition: { kind: "time_window", from: "22:30", to: "07:00", weekend_from: "01:00" },
        action: { kind: "penalty", penalty_paise: 10_000 },
        changeReason: "Two people are on shifts that start at six.",
      },
    ],
    status: "active",
  },
  {
    title: "Guests staying over",
    versions: [
      {
        text: "Tell the house before a guest stays the night. More than two nights in a row, they go on the food bill.",
        condition: { kind: "guest_nights", threshold: 2 },
        action: { kind: "charge_share" },
        changeReason: null,
      },
    ],
    status: "active",
  },
  {
    title: "Dishes go in the rack, not the sink",
    versions: [
      {
        text: "Whatever you cook in, you wash. Anything left in the sink overnight is the cook's the next morning too.",
        condition: { kind: "free_text" },
        action: { kind: "warn" },
        changeReason: null,
      },
    ],
    status: "proposed",
  },
  {
    title: "No smoking indoors",
    versions: [
      {
        text: "Balcony or outside. Not the hall, not the rooms.",
        condition: { kind: "free_text" },
        action: { kind: "warn" },
        changeReason: null,
      },
    ],
    status: "disabled",
  },
];

export async function seedRules(context) {
  const { houseId, memberIds, today } = context;

  for (const [ruleIndex, spec] of RULES.entries()) {
    const rule = await insertOne("home_rules", {
      house_id: houseId,
      title: spec.title,
      status: "draft",
      sort_order: ruleIndex,
      created_by: memberIds[0],
    });

    let currentVersionId = null;

    for (const [index, version] of spec.versions.entries()) {
      const isLatest = index === spec.versions.length - 1;
      const activates = spec.status === "active" || spec.status === "disabled";

      // Every version but the first came out of an argument somebody wrote
      // down, and every activated one carries the decision that activated it.
      const decision = activates
        ? await appliedDecision(houseId, memberIds[0], {
            type: "change_rule",
            level: "important",
            subjectType: "home_rule",
            subjectId: rule.id,
            payload: { title: spec.title, version_no: index + 1 },
            reason:
              version.changeReason ??
              `Writing down what the house already does about ${spec.title.toLowerCase()}.`,
            resolvedAt: hoursAgo(24 * (30 - index * 9)),
            createdAt: hoursAgo(24 * (33 - index * 9)),
          })
        : null;

      const row = await insertOne("home_rule_versions", {
        house_id: houseId,
        rule_id: rule.id,
        version_no: index + 1,
        original_text: version.text,
        // The first version of the oldest rule was typed out; the later ones
        // came through the parser, so the rules screen shows both provenances.
        parsed_by: index === 0 ? "manual" : "ai",
        title: spec.title,
        condition: version.condition,
        action: version.action,
        applies_to: { kind: "all" },
        weight_points: version.action.kind === "penalty" ? 5 : null,
        penalty_paise: version.action.penalty_paise ?? null,
        starts_on: addDays(today, -60 + index * 20),
        change_reason: version.changeReason,
        decision_id: decision?.id ?? null,
        activated_at: decision ? at(addDays(today, -60 + index * 20), "09:00") : null,
        superseded_at:
          decision && !isLatest ? at(addDays(today, -60 + (index + 1) * 20), "09:00") : null,
        created_by: memberIds[0],
      });

      if (isLatest && activates) currentVersionId = row.id;
    }

    // `rule_current_version_matches_status` insists anything past proposed
    // names its current version, so the status moves after the versions exist.
    must(
      "update home_rules",
      await admin
        .from("home_rules")
        .update({ status: spec.status, current_version_id: currentVersionId })
        .eq("id", rule.id)
        .select("id"),
    );
  }
}
