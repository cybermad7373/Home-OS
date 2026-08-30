import { jsonResponse, route } from "@/lib/api/handler";
import { getDailyCost } from "@/lib/data/analytics";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { insightPeriodSchema } from "@/lib/validation/insights";

/**
 * GET /api/insights/budgets?period=2026-08 — budget status for a month.
 *
 * Phase 15 carries budgets and their alert producer over from phase 8 rather
 * than rebuilding them, so this reads through the same `getDailyCost` as
 * `/api/analytics/budgets` did. Two budget calculators would eventually
 * disagree about whether a house is over, and the house would be right to
 * trust neither.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const raw = new URL(request.url).searchParams.get("period");
  const period = raw ? insightPeriodSchema.parse(raw) : undefined;

  const summary = await getDailyCost(session, context.house, context.settings, { period });

  return jsonResponse({
    period: summary.period,
    daily_budget_paise: summary.dailyBudgetPaise,
    budget_verdict: summary.budgetVerdict,
    month_to_date_paise: summary.monthToDatePaise,
    projected_month_paise: summary.projectedMonthPaise,
    categories: summary.categories.map((category) => ({
      category_id: category.categoryId,
      name: category.name,
      icon: category.icon,
      spent_paise: category.spentPaise,
      budget_paise: category.budgetPaise,
      fraction_used: category.fractionUsed,
      over: category.over,
    })),
  });
});
