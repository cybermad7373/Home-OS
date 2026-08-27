import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ApprovalQueue } from "@/components/governance/approval-queue";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { listDecisions } from "@/lib/data/governance";

export const metadata: Metadata = { title: "Approvals" };

/**
 * S-35 Approvals — the single queue, and the screen 2.0 is organised around.
 *
 * `scope=mine` is the whole difference between this and the record at
 * `/more/decisions`: everything the house has ever decided is readable by
 * everybody (that is the point of a record), and this screen is the subset
 * still waiting on the person looking at it.
 */
export default async function ApprovalsPage() {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const view = await listDecisions(session, house.id, member.id, { scope: "mine" });

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle={
          view.decisions.length === 0
            ? "Nothing is waiting on you"
            : view.decisions.length === 1
              ? "One thing is waiting on you"
              : `${view.decisions.length} things are waiting on you`
        }
      />
      <ApprovalQueue
        decisions={view.decisions}
        approvable={view.batch.approvable}
      />
    </>
  );
}
