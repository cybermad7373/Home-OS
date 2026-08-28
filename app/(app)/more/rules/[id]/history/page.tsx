import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { RuleHistory } from "@/components/house/rule-history";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { ruleHistory } from "@/lib/data/rules";

export const metadata: Metadata = { title: "Rule history" };

/**
 * S-42 — `/more/rules/:id/history`.
 *
 * Newest version first. Every member may read it: a rule's history is the
 * evidence that the rule is an agreement rather than an instruction, and
 * evidence only one person can see is not evidence.
 */
export default async function RuleHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const context = await getHouseContext(session);

  const { rule, entries } = await ruleHistory(session, context.house.id, id);

  return (
    <>
      <PageHeader
        title={rule.title}
        subtitle={`${entries.length} ${entries.length === 1 ? "version" : "versions"} · who changed it, when, and why`}
      />
      <RuleHistory entries={entries} timezone={context.house.timezone} />
    </>
  );
}
