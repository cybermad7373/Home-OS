import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Columns } from "@/components/layout/columns";
import { List, Section } from "@/components/layout/section";
import { MemberAvatar } from "@/components/ui/avatar";
import { Readout } from "@/components/ui/readout";
import { EmptyState } from "@/components/ui/empty-state";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getGameStandings } from "@/lib/data/game";
import { badgesFor } from "@/lib/domain/game";
import { houseToday } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Game layer" };

/**
 * S-54 — the game layer. Shown only when `game_layer_enabled` is true.
 *
 * Personal progress, never a ranking: streaks, badges and points per member,
 * with nobody placed above anybody.
 *
 * **Every figure on this screen used to be invented.** The streak was the
 * literal number 7, the best streak 14, the points 412, and each member's row
 * came from summing the character codes of their UUID modulo 500. It is
 * computed from confirmed chores now — see `lib/domain/game.ts`, which is why
 * this needed no new table.
 */
export default async function GameLayerPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  if (!context.settings.game_layer_enabled) {
    return (
      <>
        <PageHeader title="Game layer" />
        <EmptyState
          title="The game layer is off"
          body="When it is on, this screen shows each member's streak, points and badges — personal progress only, with no leaderboard and no ranking."
          action={
            context.isAdmin ? (
              <Link href="/admin/settings" className="underline">
                Turn it on in house settings
              </Link>
            ) : undefined
          }
        />
      </>
    );
  }

  const today = houseToday(context.house.timezone);
  const activeMembers = context.members.filter((member) => member.status === "active");
  const standings = await getGameStandings(
    session,
    context.house.id,
    activeMembers.map((member) => member.id),
    today,
  );

  const byMember = new Map(standings.map((standing) => [standing.memberId, standing]));
  const mine = byMember.get(context.me.id);
  const myBadges = mine ? badgesFor(mine) : [];
  const earnedCount = myBadges.filter((badge) => badge.earned).length;

  return (
    <>
      <PageHeader
        title="Game layer"
        subtitle="Your own progress, from your own confirmed chores"
      />

      <Columns
        asideFirst
        main={
          <>
            <Section label="Your badges" className="mt-0">
              {mine && mine.activeDays === 0 ? (
                <p className="caption-text mb-3 text-text-muted">
                  Nothing is earned yet. The first one arrives with your first
                  confirmed chore.
                </p>
              ) : null}
              <List>
                {myBadges.map((badge) => (
                  <li
                    key={badge.key}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-3",
                      badge.earned ? null : "text-text-subtle",
                    )}
                  >
                    <div className="min-w-0">
                      <p className={badge.earned ? "font-medium" : undefined}>
                        {badge.name}
                      </p>
                      <p className="caption-text text-text-muted">{badge.requirement}</p>
                    </div>
                    <span className="eyebrow-text shrink-0">
                      {badge.earned ? "Earned" : "Not yet"}
                    </span>
                  </li>
                ))}
              </List>
            </Section>

            <Section label="Everybody, unranked">
              <p className="caption-text mb-3 text-text-muted">
                In the order the house lists people, deliberately — sorting this by
                points would turn a personal record into the leaderboard this layer
                exists not to be.
              </p>
              <List>
                {activeMembers.map((member) => {
                  const standing = byMember.get(member.id);
                  return (
                    <li
                      key={member.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <MemberAvatar
                        name={member.displayName}
                        avatarUrl={member.avatarUrl}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{member.displayName}</p>
                        <p className="caption-text text-text-muted">
                          {standing && standing.activeDays > 0
                            ? `${standing.points} pts · ${standing.currentStreak}-day streak · best ${standing.bestStreak}`
                            : "No confirmed chores yet"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </List>
            </Section>
          </>
        }
        aside={
          <Section label="Your streak" className="mt-0">
            <Readout value={`${mine?.currentStreak ?? 0}`} size="xl" />
            <p className="caption-text mt-2 text-text-muted">
              {mine && mine.currentStreak > 0
                ? `days in a row. Your best is ${mine.bestStreak}.`
                : "days in a row. A day counts once, however many chores are on it, and a streak survives until the end of the following day."}
            </p>

            <dl className="mt-6 flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="eyebrow-text">Points</dt>
                <dd className="readout text-[20px]">{mine?.points ?? 0}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="eyebrow-text">Active days</dt>
                <dd className="readout text-[20px]">{mine?.activeDays ?? 0}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="eyebrow-text">Badges</dt>
                <dd className="readout text-[20px]">
                  {earnedCount}/{myBadges.length}
                </dd>
              </div>
            </dl>
          </Section>
        }
      />
    </>
  );
}
