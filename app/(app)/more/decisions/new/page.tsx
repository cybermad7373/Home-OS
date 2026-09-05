import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ProposePicker } from "@/components/governance/propose-picker";
import { LeadOnlyPage } from "@/components/ui/lead-only";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { loadProposalContext } from "@/lib/data/proposals";

export const metadata: Metadata = {
  title: "Ask the home",
  description: "Put something to the home: how it decides, how it works, and what it does with money.",
};

/**
 * S-37b — the seven decisions that had nowhere to start.
 *
 * `change_governance`, `change_home_mode`, `change_confirmation_policy`,
 * `balance_adjustment`, `set_expected_contribution`, `create_reserve` and
 * `reserve_draw` were implemented end to end — the effect in SQL, the
 * participants in the selector, the queue group, the notification wording — and
 * every one of them was unreachable, because `ProposeSheet` was mounted in two
 * files and neither of them was about any of these. The Home could read its own
 * history of governance changes and reserve draws, and could not make another
 * one. A feature you can see in the record and cannot use is worse than one
 * that was never built: the record is evidence it exists.
 *
 * All seven are Critical (`DECISION_LEVEL`), and `assertMayPropose` refuses a
 * Critical proposal from anybody but a lead — so the whole screen is a lead's,
 * and says so rather than hiding.
 */
export default async function ProposeDecisionPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  if (!context.isLead) {
    return (
      <LeadOnlyPage
        title="Ask the home"
        what="put a change to the home — how it decides, how it works, and what it does with money"
        who="lead"
        backHref="/more/decisions"
        backLabel="Back to Decisions"
      />
    );
  }

  const proposals = await loadProposalContext(session, context.house.id);

  return (
    <>
      <PageHeader
        title="Ask the home"
        subtitle="Nothing here changes anything on its own. Each one asks the people it affects, and moves when they answer"
      />
      <ProposePicker context={proposals} currency={context.house.currency} />
    </>
  );
}
