import Link from "next/link";
import { MemberAvatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";

interface Member {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  room?: { name: string } | null;
  role: "admin" | "co_admin" | "member" | null;
}

/**
 * Everyone who lives here, as a strip rather than a list.
 *
 * It used to be six full-width rows with an avatar, a name, a room and a
 * badge — a third of the screen spent on a fact that changes about twice a
 * year. As a scrolling strip of faces it takes one row, shows eight people
 * instead of six, and still gets you to anybody in one tap.
 *
 * Every member wore a green "home" status dot in the 2.0 version regardless of
 * whether they were actually in the house, so the dot meant nothing. It is
 * gone; presence is `/house/away`'s job, and it knows the answer.
 */
export function HomeHouseMembers({ active, meId }: { active: Member[]; meId: string }) {
  if (active.length === 0) return null;

  return (
    <ul className="scroll-x flex gap-1 py-1">
      {active.map((member) => {
        const isMe = member.id === meId;
        const lead = member.role === "admin" || member.role === "co_admin";
        return (
          <li key={member.id} className="shrink-0">
            <Link
              href="/house/members"
              className="flex w-[76px] flex-col items-center gap-2 rounded-[var(--radius-md)] px-1 py-2 transition-colors hover:bg-surface-2"
            >
              <MemberAvatar
                name={isMe ? "You" : member.displayName}
                avatarUrl={member.avatarUrl}
                size="lg"
                ring={isMe}
              />
              <span className="w-full text-center">
                <span className={cn("block truncate text-[12px]", isMe && "font-medium")}>
                  {isMe ? "You" : member.displayName.split(/\s+/)[0]}
                </span>
                <span className="eyebrow-text block truncate">
                  {lead ? "Lead" : (member.room?.name ?? "—")}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
