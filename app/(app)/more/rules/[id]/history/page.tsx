import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { RuleHistory } from "@/components/house/rule-history";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { ruleHistory } from "@/lib/data/rules";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api/errors";
import { looksLikeUuid } from "@/lib/validation/common";

export const metadata: Metadata = {
  title: "Rule history",
  description: "Every version of this rule, and who agreed to each.",
};

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
  // A rule id off a URL. Malformed, it reached Postgres and raised 22P02; valid
  // but unknown, `ruleHistory` threw NOT_FOUND and nothing caught it. Both came
  // out as "Something went wrong" for a link that simply names nothing.
  if (!looksLikeUuid(id)) notFound();

  const session = await requireSession();
  const context = await getHouseContext(session);

  let history;
  try {
    history = await ruleHistory(session, context.house.id, id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const { rule, entries } = history;

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
