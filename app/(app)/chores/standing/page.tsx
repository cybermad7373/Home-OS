import type { Metadata } from "next";
import { Leaderboard } from "@/components/chores/leaderboard";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getStanding } from "@/lib/data/chores";
import { concentrationRatio, rankStanding } from "@/lib/domain/fairness/targets";

export const metadata: Metadata = { title: "House standing" };

export default async function StandingPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const standing = await getStanding(session, context.house.id);

  const ranked = rankStanding(standing).map((row) => ({
    ...row,
    displayName: standing.find((s) => s.memberId === row.memberId)?.displayName ?? "Someone",
    avatarUrl: standing.find((s) => s.memberId === row.memberId)?.avatarUrl ?? null,
  }));

  if (ranked.every((row) => row.earnedPoints === 0)) {
    return (
      <>
        <PageHeader title="House standing" />
        <EmptyState
          title="Nothing confirmed yet"
          body="Points appear here as chores are done and confirmed by somebody else. The first week is always empty."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="House standing"
        subtitle="Points earned, against what each person owed"
      />
      <Leaderboard
        standing={ranked}
        concentrationRatio={concentrationRatio(ranked)}
        myMemberId={context.me.id}
      />
    </>
  );
}
