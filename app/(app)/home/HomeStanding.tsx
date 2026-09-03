import { MemberAvatar } from "@/components/ui/avatar";
import { concentrationRatio } from "@/lib/domain/fairness/targets";
import type { StandingRow } from "@/lib/domain/fairness/targets";
import { cn } from "@/lib/utils/cn";
import { Meter } from "./HomeFigures";

/**
 * Who is carrying the week.
 *
 * Two things went from the 2.0 version. Each row had a 36px animated ring
 * *and* a points fraction beside it, which is the same fact drawn twice at the
 * cost of the row's height; the ring is now a hairline meter under the name.
 * And the concentration ratio was a badge reading "Unbalanced" in amber next
 * to a percentage in brand colour — a judgement in two colours where the
 * sentence "three people are doing 62% of the work" is both plainer and more
 * useful. The threshold is unchanged; only the way it is said.
 */
export function HomeStanding({
  ranked,
  meId,
}: {
  ranked: (StandingRow & { displayName?: string; avatarUrl?: string | null })[];
  meId: string;
}) {
  const topThree = ranked.slice(0, 3);
  const myIndex = ranked.findIndex((row) => row.memberId === meId);
  const myRow = myIndex >= 3 ? ranked[myIndex] : undefined;
  const rows = [
    ...topThree.map((row, index) => ({ row, rank: index + 1 })),
    ...(myRow ? [{ row: myRow, rank: myIndex + 1 }] : []),
  ];
  const concentration = concentrationRatio(ranked);
  const heavy = concentration > 0.45;

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      <p
        className={cn(
          "caption-text border-b border-border px-4 py-2.5",
          heavy ? "text-text" : "text-text-muted",
        )}
      >
        The top three are doing{" "}
        <span className="tabular font-medium text-text">{Math.round(concentration * 100)}%</span>{" "}
        of the work
        {heavy ? " — more than an even share" : ""}
      </p>

      <ul className="divide-y divide-border">
        {rows.map(({ row, rank }) => {
          const isMe = row.memberId === meId;
          return (
            <li
              key={row.memberId}
              className={cn("flex items-center gap-3 px-4 py-3", isMe && "bg-surface-2")}
            >
              <span className="readout w-5 shrink-0 text-[15px] leading-none text-text-subtle">
                {rank}
              </span>
              <MemberAvatar
                name={isMe ? "You" : (row.displayName ?? "Someone")}
                avatarUrl={row.avatarUrl ?? null}
                size="sm"
                ring={isMe}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={cn("truncate text-[15px]", isMe && "font-medium")}>
                    {isMe ? "You" : (row.displayName ?? "Someone")}
                  </p>
                  <p className="tabular caption-text shrink-0 text-text-muted">
                    {row.earnedPoints}
                    <span className="text-text-subtle">/{row.targetPoints}</span>
                  </p>
                </div>
                <Meter value={row.earnedPoints} max={row.targetPoints} className="mt-2" />
              </div>
              {row.choresMissed > 0 ? (
                <span className="caption-text tabular shrink-0 text-danger">
                  {row.choresMissed} missed
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
