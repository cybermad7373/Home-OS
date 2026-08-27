import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DecisionLog } from "@/components/governance/decision-log";
import { listDecisions } from "@/lib/data/governance";
import { requireActiveMembership, requireSession } from "@/lib/data/house";

export const metadata: Metadata = { title: "Decisions" };

/**
 * The decision record — everything the house has decided, open or settled.
 *
 * Approvals shows what is waiting on the person looking; this shows everything,
 * including decisions they were never asked about. A record only its
 * participants can read is an admin action with extra steps, which is the
 * outcome the whole subsystem exists to prevent.
 */
export default async function DecisionsPage() {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const view = await listDecisions(session, house.id, member.id, { scope: "all" });

  const waiting = view.decisions.filter((decision) => decision.status === "waiting");
  const settled = view.decisions.filter((decision) => decision.status !== "waiting");

  return (
    <>
      <PageHeader
        title="Decisions"
        subtitle="Everything the house has been asked, and how it answered"
      />

      <div className="flex flex-col gap-6">
        {waiting.length > 0 ? (
          <section aria-labelledby="open-decisions">
            <h2 id="open-decisions" className="heading-text mb-2">
              Still open
            </h2>
            <DecisionLog decisions={waiting} callerMemberId={member.id} />
          </section>
        ) : null}

        <section aria-labelledby="settled-decisions">
          <h2 id="settled-decisions" className="heading-text mb-2">
            {waiting.length > 0 ? "Settled" : "Everything so far"}
          </h2>
          <DecisionLog decisions={settled} callerMemberId={member.id} />
        </section>
      </div>
    </>
  );
}
