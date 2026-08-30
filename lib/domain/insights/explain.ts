/**
 * Point explainability (EF-12).
 *
 * "Every points figure openable to the dated records that produced it, and a
 * zero explained as readily as a total."
 *
 * The zero clause is the one that needs code rather than a screen. A member
 * who earned nothing has an empty component list, and an empty list rendered
 * naively looks like a failure to load. So a breakdown always reports whether
 * its components reconcile with the figure that was shown, and an empty list
 * that reconciles with zero is a complete, correct answer.
 */

import type { PointBreakdown, PointBreakdownInput, PointComponent } from "./types";

export function explainPoints(input: PointBreakdownInput): PointBreakdown {
  // Newest first: somebody opening a total is nearly always checking the thing
  // they just did.
  const components = [...input.components].sort(
    (a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label),
  );

  const componentPoints = components.reduce((sum, component) => sum + component.points, 0);

  return {
    memberId: input.memberId,
    displayName: input.displayName,
    claimedPoints: input.claimedPoints,
    componentPoints,
    reconciles: componentPoints === input.claimedPoints,
    components,
  };
}

/**
 * Only confirmed work earns points, so only confirmed rows may appear in a
 * breakdown of an earned total. Everything else belongs on the chore screens,
 * where it can still be acted on.
 */
export function earnedComponents(components: PointComponent[]): PointComponent[] {
  return components.filter((component) => component.status === "confirmed");
}
