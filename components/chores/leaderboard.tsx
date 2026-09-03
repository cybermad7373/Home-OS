import { List } from "@/components/layout/section";
import { MemberAvatar } from "@/components/ui/avatar";
import { PointsBreakdownButton } from "@/components/chores/points-breakdown";
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
 * coasting, with the numbers behind it.
 *
 * Being behind on chores is not a financial state, so it is not drawn in one:
 * the carry is a signed number in ink, and the only colour on the row is the
 * count of chores somebody missed. Green and red belong to money — the house
 * owes you, or you owe the house — and spending them on effort as well would
 * leave the ledger with nothing to say.
 *
 * The caller's own row is always shown, even when they are outside the top
 * three, so nobody has to scroll to find themselves.
 *
 * Every points figure here opens to the chores that produced it (EF-12). The
 * number is the button: a member questioning a figure taps the figure.
 */
export function Leaderboard({
  standing,
  concentrationRatio,
  myMemberId,
  limit,
  from,
  to,
}: {
  standing: StandingRow[];
  concentrationRatio: number;
  myMemberId: string;
  limit?: number;
  /** The range the figures cover, so a breakdown opens on the same records. */
  from: string;
  to: string;
}) {
  const top = limit ? standing.slice(0, limit) : standing;
  const me = standing.find((row) => row.memberId === myMemberId);
  const rows =
    me && !top.some((row) => row.memberId === myMemberId) ? [...top, me] : top;

  const maxPoints = Math.max(1, ...standing.map((row) => row.earnedPoints));
  const percent = Math.round(concentrationRatio * 100);

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      {standing.some((row) => row.earnedPoints > 0) ? (
        <p className="caption-text border-b border-border px-4 py-2.5 text-text-muted">
          The top three are doing{" "}
          <span className="tabular font-medium text-text">{percent}%</span> of the work
          {percent > 45
            ? " — the house is leaning on a few people. The target is under 45 percent."
            : " — under the 45 percent target, so the load is spread."}
        </p>
      ) : null}

      <List className="rounded-none border-0">
        {rows.map((row) => (
          <li
            key={row.memberId}
            className={cn(
              "flex items-center gap-3 px-4 py-3",
              row.memberId === myMemberId && "bg-surface-2",
            )}
          >
            <span className="readout w-5 shrink-0 text-[15px] leading-none text-text-subtle">
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
                <span className="shrink-0">
                  <PointsBreakdownButton
                    memberId={row.memberId}
                    displayName={row.displayName}
                    points={row.earnedPoints}
                    from={from}
                    to={to}
                  />
                </span>
              </span>

              <span className="mb-1.5 mt-2 block h-[3px] bg-surface-3">
                <span
                  className="block h-full bg-primary"
                  style={{ width: `${(row.earnedPoints / maxPoints) * 100}%` }}
                />
              </span>

              <span className="caption-text flex justify-between text-text-muted">
                <span>
                  {row.choresDone} done
                  {row.choresMissed > 0 ? (
                    <span className="text-danger"> · {row.choresMissed} missed</span>
                  ) : null}
                </span>
                <span className="tabular">
                  {row.carry > 0 ? "+" : ""}
                  {row.carry} against target
                </span>
              </span>
            </span>
          </li>
        ))}
      </List>
    </div>
  );
}
