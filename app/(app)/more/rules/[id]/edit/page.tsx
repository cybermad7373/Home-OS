import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { RuleForm } from "@/components/house/rule-form";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listRules, ruleParseContext } from "@/lib/data/rules";

export const metadata: Metadata = { title: "Edit a rule" };

/**
 * S-41, in its editing form.
 *
 * The form opens on the version currently in force, because that is what the
 * Home is bound by right now and what an edit is an edit *of*. Nothing here
 * changes it: submitting appends a version and asks the Home, and the version
 * underneath stays in force until they answer.
 */
export default async function EditRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const context = await getHouseContext(session);

  const rules = await listRules(session, context.house.id);
  const rule = rules.find((entry) => entry.id === id);
  if (!rule) notFound();

  const parse = await ruleParseContext(session, context.house.id);
  const current = rule.current;

  return (
    <>
      <PageHeader
        title="Edit a rule"
        subtitle="This creates the next version. Nothing changes until the house agrees."
      />
      <RuleForm
        templates={parse.choreTemplates}
        initial={{
          ruleId: rule.id,
          versionNo: current?.versionNo ?? 0,
          title: current?.title ?? rule.title,
          originalText: current?.originalText ?? "",
          conditionKind: current?.condition.kind ?? "other",
          conditionDetail:
            current?.condition.template ??
            current?.condition.state ??
            current?.condition.after ??
            current?.condition.description ??
            "",
          actionKind: current?.action.kind ?? "other",
          actionText: current?.action.text ?? current?.action.description ?? "",
          appliesToKind: current?.appliesTo.kind ?? "all",
          appliesToValue: current?.appliesTo.value ?? "",
          weightPoints:
            current?.weightPoints === null || current?.weightPoints === undefined
              ? ""
              : String(current.weightPoints),
          penaltyRupees:
            current?.penaltyPaise === null || current?.penaltyPaise === undefined
              ? ""
              : String(current.penaltyPaise / 100),
          startsOn: current?.startsOn ?? "",
          endsOn: current?.endsOn ?? "",
        }}
      />
    </>
  );
}
