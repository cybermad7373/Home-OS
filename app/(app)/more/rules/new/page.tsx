import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { RuleForm } from "@/components/house/rule-form";
import { LeadOnlyPage } from "@/components/ui/lead-only";
import { requireSession, getHouseContext } from "@/lib/data/house";
import { ruleParseContext } from "@/lib/data/rules";

export const metadata: Metadata = {
  title: "Write a rule",
  description: "Write a house rule in your own words and put it to the home.",
};

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

  // The rules list has always hidden Add a rule from a member, and this screen
  // did not check at all — so a member who reached the URL got the whole form,
  // wrote a rule in their own words, and was refused by the API at the moment
  // they submitted it. Eleven fields of wasted effort is a worse refusal than
  // no button.
  if (!context.isLead) {
    return (
      <LeadOnlyPage
        title="Write a rule"
        what="put a new rule to the home"
        who="lead"
        backHref="/more/rules"
        backLabel="Back to House rules"
      />
    );
  }

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
