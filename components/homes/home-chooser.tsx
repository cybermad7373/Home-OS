"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Plus } from "lucide-react";
import { BottomSheet } from "@/components/ui/sheet";
import { CreateForm, JoinForm } from "@/components/forms/join-or-create";
import { cn } from "@/lib/utils/cn";
import type { HomeCard } from "@/lib/data/homes";
import { HOME_TYPE_LABEL } from "@/lib/types/domain";

/**
 * The screen a person meets after signing in: one card per Home, and you pick
 * the one you want to be in.
 *
 * Before this the app chose for you and never said so. The selection was a
 * cookie resolved server-side, and a fresh browser had no cookie — so somebody
 * who belongs to three Homes was dropped into whichever one the query returned
 * first, with the Home's name in the header being the only clue anything had
 * been decided. Landing in a Home you do not run means an app with no create
 * controls in it, so the invisible decision was also the expensive one.
 *
 * A card carries what you need to tell two Homes apart at a glance — the name,
 * what kind of home it is, whether you run it, how many people are in it, and
 * what is waiting on you there. Creating a Home and joining one with a code are
 * on this screen too, because "my homes" that cannot gain a home is a list
 * pretending to be a place.
 */

const ROLE_LABEL: Record<string, string> = {
  admin: "You run this home",
  co_admin: "You help run this home",
  member: "You live here",
};

export function HomeChooser({
  homes,
  selectedId,
}: {
  homes: HomeCard[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const [entering, setEntering] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"create" | "join" | null>(null);
  const [, startTransition] = useTransition();

  async function enter(houseId: string) {
    setEntering(houseId);
    const response = await fetch("/api/homes/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ house_id: houseId }),
    });
    if (!response.ok) {
      setEntering(null);
      return;
    }
    startTransition(() => {
      router.push("/home");
      router.refresh();
    });
  }

  const active = homes.filter((home) => home.status === "active");
  const requested = homes.filter((home) => home.status === "requested");

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((home) => (
          <li key={home.id}>
            <HomeFlashCard
              home={home}
              isCurrent={home.id === selectedId}
              busy={entering === home.id}
              disabled={entering !== null}
              onEnter={() => enter(home.id)}
            />
          </li>
        ))}

        {requested.map((home) => (
          <li key={home.id}>
            <WaitingCard home={home} />
          </li>
        ))}

        <li>
          <ActionCard
            icon={<Plus size={18} aria-hidden />}
            title="Create a home"
            body="A shared flat or a family home. You become its admin — you set the rooms, the rules and who gets in."
            onClick={() => setSheet("create")}
          />
        </li>

        <li>
          <ActionCard
            icon={<KeyRound size={18} aria-hidden />}
            title="Join with a code"
            body="Paste the invite link somebody sent you. You ask to join, and they let you in."
            onClick={() => setSheet("join")}
          />
        </li>
      </ul>

      <BottomSheet
        open={sheet === "create"}
        onClose={() => setSheet(null)}
        title="Create a home"
        size="full"
      >
        <CreateForm
          router={router}
          afterCreate="/home"
          onBack={() => setSheet(null)}
        />
      </BottomSheet>

      <BottomSheet
        open={sheet === "join"}
        onClose={() => setSheet(null)}
        title="Join with a code"
      >
        <JoinForm router={router} onBack={() => setSheet(null)} />
      </BottomSheet>
    </>
  );
}

/**
 * One Home, as a card you press.
 *
 * The whole card is the control, not a link buried at the bottom of it: the
 * card *is* the choice, and a 300px target beats a 90px one on a phone held in
 * one hand.
 */
function HomeFlashCard({
  home,
  isCurrent,
  busy,
  disabled,
  onEnter,
}: {
  home: HomeCard;
  isCurrent: boolean;
  busy: boolean;
  disabled: boolean;
  onEnter: () => void;
}) {
  const runsIt = home.role === "admin" || home.role === "co_admin";

  return (
    <button
      type="button"
      onClick={onEnter}
      disabled={disabled}
      aria-label={`Enter ${home.name}`}
      className={cn(
        "group relative flex h-full w-full flex-col items-start gap-3 rounded-[var(--radius-lg)]",
        "border bg-surface p-4 text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:opacity-60",
        isCurrent
          ? "border-border-strong"
          : "border-border hover:border-primary",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <p className="eyebrow-text text-text-muted">
          {isCurrent ? "Where you were" : HOME_TYPE_LABEL[home.homeType]}
        </p>
        {home.pendingCount > 0 ? (
          <span className="tabular shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-fg">
            {home.pendingCount} waiting
          </span>
        ) : null}
      </div>

      {/* The name is set in the reading face, not the mono display one. The
          display face is for figures; a proper noun set in it reads as a serial
          number, and telling two Homes apart by name is the entire job of this
          screen. */}
      <p className="w-full break-words text-[26px] font-semibold leading-[1.15] tracking-[-0.02em]">
        {home.name}
      </p>

      <div className="mt-auto w-full">
        <p className="caption-text text-text-muted">
          {ROLE_LABEL[home.role ?? "member"] ?? "You live here"}
          {home.memberCount > 0
            ? ` · ${home.memberCount} ${home.memberCount === 1 ? "person" : "people"}`
            : ""}
        </p>

        <span
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium",
            runsIt ? "text-text" : "text-text-muted",
            "group-hover:text-primary",
          )}
        >
          {busy ? "Opening…" : "Enter"}
          <ArrowRight
            size={15}
            aria-hidden
            className="transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </button>
  );
}

/** A Home that has not let you in yet. It is on the list; it is not a door. */
function WaitingCard({ home }: { home: HomeCard }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-4">
      <p className="eyebrow-text text-text-muted">Waiting to be let in</p>
      <p className="w-full break-words text-[26px] font-semibold leading-[1.15] tracking-[-0.02em]">
        {home.name}
      </p>
      <p className="caption-text mt-auto text-text-muted">
        Nothing to see here until somebody lets you in — not the members, not
        the money, not the chores.
      </p>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  body,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full w-full flex-col items-start gap-2 rounded-[var(--radius-lg)]",
        "border border-dashed border-border bg-transparent p-4 text-left transition-colors",
        "hover:border-primary hover:bg-surface",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      )}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-text">
        {icon}
      </span>
      <span className="heading-text">{title}</span>
      <span className="caption-text text-text-muted">{body}</span>
    </button>
  );
}
