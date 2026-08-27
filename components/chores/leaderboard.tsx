import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { MemberAvatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";

export interface StandingRow {
  rank: number;
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  earnedPoints: number;
  targetPoints: number;
  carry: number;
  choresDone: number;
  choresMissed: number;
}

/**
 * S-15 — the house standing.
 *
 * The whole product in one screen: who is carrying the house and who is
 * coasting, with the numbers behind it. Green means ahead of target, red means
 * behind. That mapping never inverts anywhere in the app.
 *
 * The caller's own row is always shown, even when they are outside the top
 * three, so nobody has to scroll to find themselves.
 */
export function Leaderboard({
  standing,
  concentrationRatio,
  myMemberId,
  limit,
}: {
  standing: StandingRow[];
  concentrationRatio: number;
  myMemberId: string;
  limit?: number;
}) {
  const top = limit ? standing.slice(0, limit) : standing;
  const me = standing.find((row) => row.memberId === myMemberId);
  const rows =
    me && !top.some((row) => row.memberId === myMemberId) ? [...top, me] : top;

  const maxPoints = Math.max(1, ...standing.map((row) => row.earnedPoints));
  const percent = Math.round(concentrationRatio * 100);

  return (
    <Card className="p-0">
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.memberId}
            className={cn(
              "flex items-center gap-3 px-4 py-3",
              row.memberId === myMemberId && "bg-surface-2",
            )}
          >
            <span className="tabular w-5 shrink-0 text-[13px] text-text-muted">
              {row.rank}
            </span>

            <MemberAvatar name={row.displayName} avatarUrl={row.avatarUrl} size="sm" />

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">
                  {row.displayName}
                  {row.memberId === myMemberId ? (
                    <span className="caption-text text-text-subtle"> · you</span>
                  ) : null}
                </span>
                <span className="tabular shrink-0 text-[13px] font-semibold">
                  {row.earnedPoints}
                </span>
              </span>

              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full bg-primary"
                  style={{ width: `${(row.earnedPoints / maxPoints) * 100}%` }}
                />
              </span>

              <span className="caption-text mt-1 flex justify-between text-text-muted">
                <span>
                  {row.choresDone} done
                  {row.choresMissed > 0 ? ` · ${row.choresMissed} missed` : ""}
                </span>
                <span
                  className={
                    row.carry > 0
                      ? "text-success"
                      : row.carry < 0
                        ? "text-danger"
                        : undefined
                  }
                >
                  {row.carry > 0 ? "+" : ""}
                  {row.carry} against target
                </span>
              </span>
            </span>
          </li>
        ))}
      </ul>

      {standing.some((row) => row.earnedPoints > 0) ? (
        <div className="border-t border-border px-4 py-3">
          <CardTitle>Top three did {percent}% of the work</CardTitle>
          <CardDescription>
            {percent > 45
              ? "The house is still leaning on a few people. The target is under 45 percent."
              : "Under the 45 percent target — the load is spread."}
          </CardDescription>
        </div>
      ) : null}
    </Card>
  );
}
