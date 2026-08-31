"use client";

import Link from "next/link";
import { Card, CardShell, CardCore } from "@/components/ui/card";
import { MemberAvatar, AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SectionReveal } from "@/components/motion/StaggerReveal";
import { motion, useReducedMotion } from "motion/react";

interface Member {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  room?: { name: string } | null;
  role: "admin" | "co_admin" | "member" | null;
}

interface HomeHouseMembersProps {
  active: Member[];
  meId: string;
}

export function HomeHouseMembers({ active, meId }: HomeHouseMembersProps) {
  const reduce = useReducedMotion();
  const displayMembers = active.slice(0, 6);
  const remaining = active.length - 6;

  return (
    <SectionReveal>
      <section className="mt-8" aria-labelledby="members-heading">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="members-heading" className="heading-text">The house</h2>
          <Link className="caption-text text-primary hover:underline" href="/house/members">
            See all →
          </Link>
        </div>

        <CardShell className="overflow-hidden">
          <CardCore className="p-0">
            <ul className="divide-y divide-border" role="list" aria-label="House members">
              {displayMembers.map((member, index) => (
                <motion.li
                  key={member.id}
                  className={member.id === meId ? "bg-primary/5 relative" : ""}
                  initial={reduce ? false : { opacity: 0, x: -20 }}
                  animate={reduce ? false : { opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  {member.id === meId && !reduce && (
                    <motion.div
                      className="absolute inset-0 -inset-px rounded-[1.25rem] border border-primary/20 pointer-events-none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5 }}
                    />
                  )}
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50 transition-colors">
                    <MemberAvatar
                      name={member.id === meId ? "You" : member.displayName}
                      avatarUrl={member.avatarUrl}
                      size="md"
                      status="home"
                      ring={member.id === meId}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {member.id === meId ? "You" : member.displayName}
                        {member.id === meId && (
                          <span className="caption-text text-text-subtle ml-2">· you</span>
                        )}
                      </p>
                      <p className="caption-text text-text-muted">
                        {member.room?.name ?? "No room"}
                      </p>
                    </div>
                    {member.role === "admin" && (
                      <Badge tone="primary" animate>
                        Admin
                      </Badge>
                    )}
                    {member.role === "co_admin" && (
                      <Badge tone="info" animate>
                        Co-Admin
                      </Badge>
                    )}
                  </div>
                </motion.li>
              ))}

              {remaining > 0 && (
                <motion.li
                  className="px-4 py-3 text-center"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={reduce ? false : { opacity: 1 }}
                  transition={{ delay: displayMembers.length * 0.04, duration: 0.3 }}
                >
                  <AvatarStack
                    avatars={active.slice(6, 10).map((m) => ({
                      name: m.displayName,
                      avatarUrl: m.avatarUrl,
                    }))}
                    max={4}
                    size="sm"
                  />
                  <p className="caption-text text-text-muted mt-2">
                    and {remaining} more {remaining === 1 ? "member" : "members"}
                  </p>
                </motion.li>
              )}
            </ul>
          </CardCore>
        </CardShell>
      </section>
    </SectionReveal>
  );
}