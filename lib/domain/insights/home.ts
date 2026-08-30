/**
 * Home insights (IN-05).
 *
 * The three questions phase 15 says the Home must answer about itself: how
 * active is it, how much is waiting on a decision, and how unevenly is the
 * work falling.
 */

import type { HomeInsightsInput, HomeInsightsOutput } from "./types";

export function buildHomeInsights(input: HomeInsightsInput): HomeInsightsOutput {
  const records = input.expenseCount + input.mealCount + input.choresConfirmed;

  return {
    range: input.range,
    activity: {
      expenses: input.expenseCount,
      meals: input.mealCount,
      choresConfirmed: input.choresConfirmed,
      choresMissed: input.choresMissed,
      recordsPerMember:
        input.activeMembers === 0 ? null : Math.round((records / input.activeMembers) * 10) / 10,
    },
    decisions: {
      open: input.decisionsOpen,
      resolved: input.decisionsResolved,
    },
    imbalance: imbalanceOf(input),
  };
}

/**
 * A family Home is not shown either figure (BR-260). Both exist to answer
 * "is somebody carrying this house", which is a question about flatmates
 * splitting a shared load — asked of a family it reads as a parent being told
 * they do too much for their children.
 */
function imbalanceOf(input: HomeInsightsInput): HomeInsightsOutput["imbalance"] {
  if (input.isFamily) return { topThreeShare: null, maxDeviationPoints: null };

  const points = input.effortByMember.map((row) => Math.max(0, row.points));
  const total = points.reduce((sum, value) => sum + value, 0);
  if (points.length === 0 || total === 0) {
    return { topThreeShare: null, maxDeviationPoints: null };
  }

  const descending = [...points].sort((a, b) => b - a);
  const average = total / points.length;

  return {
    topThreeShare: descending.slice(0, 3).reduce((sum, value) => sum + value, 0) / total,
    maxDeviationPoints: Math.max(...points.map((value) => Math.abs(value - average))),
  };
}
