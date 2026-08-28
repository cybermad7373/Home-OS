import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { RuleList } from "@/components/house/rule-list";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listRules } from "@/lib/data/rules";

export const metadata: Metadata = { title: "House rules" };

/**
 * S-40 — `/more/rules`.
 *
 * Every member sees the list. Only a lead sees Edit, Disable and Add, because
 * only a lead may propose a rule change — but the rules themselves are what the
 * whole Home is bound by, so hiding them from the people bound by them would
 * make them instructions rather than an agreement.
 */
export default async function RulesPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const rules = await listRules(session, context.house.id);

  return (
    <>
      <PageHeader
        title="House rules"
        subtitle="What this home agreed, in its own words — and every version of it"
      />
      <RuleList
        rules={rules}
        isLead={context.isLead}
        timezone={context.house.timezone}
      />
    </>
  );
}
