import type { Metadata } from "next";
import { GeneratePanel } from "@/components/chores/generate-panel";
import { LlmRunsPanel } from "@/components/chores/llm-runs-panel";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getScheduleRuns, nextWeekStart } from "@/lib/data/chores";
import { getScheduleRunSummary } from "@/lib/data/llm";
import { houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Schedule runs" };

export default async function SchedulePage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const runs = await getScheduleRuns(session, context.house.id);
  // Admin-only by policy: `llm_runs` has one `select` policy and it names
  // `is_house_admin`. A member reading this page gets null and no panel.
  const llmRuns = context.isAdmin
    ? await getScheduleRunSummary(session, context.house.id)
    : null;

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle="How each week was produced, and what it cost each person"
      />
      <LlmRunsPanel summary={llmRuns} />
      <GeneratePanel
        runs={runs}
        defaultWeekStart={nextWeekStart(houseToday(context.house.timezone))}
        isAdmin={context.isAdmin}
      />
    </>
  );
}
