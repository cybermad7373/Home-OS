import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { RuleForm } from "@/components/house/rule-form";
import { requireSession, getHouseContext } from "@/lib/data/house";
import { ruleParseContext } from "@/lib/data/rules";

export const metadata: Metadata = { title: "Write a rule" };

/**
 * S-41 — `/more/rules/new`.
 *
 * The parse button is offered optimistically and withdraws itself the first
 * time the endpoint answers `manual`. Asking the server up front whether a key
 * exists would put an AI question on the critical path of a screen that works
 * completely without one.
 */
export default async function NewRulePage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const parse = await ruleParseContext(session, context.house.id);

  return (
    <>
      <PageHeader
        title="Write a rule"
        subtitle="Say it how you would say it. The house has to agree before it counts."
      />
      <RuleForm templates={parse.choreTemplates} />
    </>
  );
}
