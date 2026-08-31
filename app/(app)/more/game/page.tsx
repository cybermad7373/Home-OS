import type { Metadata } from "next";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { MemberAvatar } from "@/components/ui/avatar";
import { BadgeDot } from "@/components/ui/badge";
import { ProgressRing } from "@/components/ui/progress";
import { getHouseContext, requireSession } from "@/lib/data/house";

export const metadata: Metadata = { title: "Game layer" };

/**
 * S-54 — Game Layer.
 *
 * Shown only when `game_layer_enabled` is true.
 * Per-member cards showing: points total, current streak, longest streak, badges.
 * No leaderboard, no ranking, no comparison between members.
 * Badges displayed as a grid of icons with labels.
 * Reachable from More (CL-05) and from member profiles.
 */
export default async function GameLayerPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  // If game layer is not enabled, redirect to more
  if (!context.settings.game_layer_enabled) {
    return (
      <>
        <PageHeader title="Game layer" />
        <Card>
          <CardTitle>Game layer is off</CardTitle>
          <CardDescription>
            An admin can enable the game layer in <a href="/admin/settings" className="underline">House settings</a>.
            When enabled, this screen shows streaks, badges and game points for each member.
          </CardDescription>
        </Card>
      </>
    );
  }

  const activeMembers = context.members.filter((m) => m.status === "active");

  return (
    <>
      <PageHeader title="Game layer" />

      <Card className="mb-4">
        <CardTitle>Your progress</CardTitle>
        <CardDescription>
          Game points, streaks and badges are personal &mdash; no leaderboard, no ranking.
        </CardDescription>
        <div className="mt-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <ProgressRing
              value={7}
              max={14}
              size={100}
              strokeWidth={8}
              variant="primary"
            >
              <div className="text-center">
                <p className="display-number">7</p>
                <p className="caption-text text-text-muted">day streak</p>
              </div>
            </ProgressRing>
          </div>
          <div className="flex-1">
            <ProgressRing
              value={14}
              max={30}
              size={100}
              strokeWidth={8}
              variant="success"
            >
              <div className="text-center">
                <p className="display-number">14</p>
                <p className="caption-text text-text-muted">best streak</p>
              </div>
            </ProgressRing>
          </div>
          <div className="flex-1">
            <ProgressRing
              value={412}
              max={500}
              size={100}
              strokeWidth={8}
              variant="warning"
            >
              <div className="text-center">
                <p className="display-number">412</p>
                <p className="caption-text text-text-muted">game pts</p>
              </div>
            </ProgressRing>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <BadgeBadge icon="🏆" label="First win" earned />
          <BadgeBadge icon="🔥" label="Week warrior" earned />
          <BadgeBadge icon="💯" label="Century" earned />
          <BadgeBadge icon="⭐" label="Star player" />
        </div>
      </Card>

      <Card>
        <CardTitle>Badges</CardTitle>
        <CardDescription>
          Earned by reaching milestones. Tap a badge to see its requirement.
        </CardDescription>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <BadgeCard icon="🏆" name="First win" description="Earned your first game point" earned />
          <BadgeCard icon="🔥" name="Week warrior" description="7-day streak" earned />
          <BadgeCard icon="💯" name="Century" description="100 game points" earned />
          <BadgeCard icon="⭐" name="Star player" description="500 game points" />
          <BadgeCard icon="🏅" name="Marathon" description="30-day streak" />
          <BadgeCard icon="💎" name="Diamond" description="1,000 game points" />
          <BadgeCard icon="👑" name="Legend" description="365-day streak" />
          <BadgeCard icon="🌟" name="Galaxy" description="5,000 game points" />
        </div>
      </Card>

      <Card>
        <CardTitle>Everyone&apos;s progress</CardTitle>
        <CardDescription>
          No leaderboard &mdash; just personal progress for each member.
        </CardDescription>
        <div className="mt-4 space-y-3">
          {activeMembers.map((member) => (
            <MemberProgressCard key={member.id} member={member} />
          ))}
        </div>
      </Card>
    </>
  );
}

function BadgeBadge({ icon, label, earned = false }: { icon: string; label: string; earned?: boolean }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl border bg-surface-2/50">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="font-medium">{label}</p>
        <p className="caption-text text-text-muted text-[11px]">
          {earned ? "Earned" : "Locked"}
        </p>
      </div>
    </div>
  );
}

function BadgeCard({ icon, name, description, earned = false }: { icon: string; name: string; description: string; earned?: boolean }) {
  return (
    <Card className={earned ? "border-primary/30" : "opacity-60"}>
      <div className="flex items-center gap-3">
        <span className="text-3xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium">{name}</p>
          <p className="caption-text text-text-muted truncate">{description}</p>
        </div>
        {earned && <BadgeDot tone="success" />}
      </div>
    </Card>
  );
}

function MemberProgressCard({ member }: { member: { id: string; displayName: string; avatarUrl: string | null } }) {
  // Deterministic mock data based on member ID - stable across renders
  const hash = member.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const points = hash % 500;
  const streak = hash % 21;
  const bestStreak = streak + (hash % 10);

  return (
    <Card className="flex items-center gap-3 p-4">
      <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} size="md" />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{member.displayName}</p>
        <div className="flex gap-4 mt-1 text-[13px] text-text-muted">
          <span>🏆 {points} pts</span>
          <span>🔥 {streak} day streak</span>
          <span>⭐ {bestStreak} best</span>
        </div>
      </div>
    </Card>
  );
}