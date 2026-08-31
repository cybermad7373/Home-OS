"use client";

import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import { motion, useReducedMotion } from "motion/react";

const SIZES = { sm: 28, md: 36, lg: 48, xl: 64 } as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

interface MemberAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
  showName?: boolean;
  className?: string;
  status?: "home" | "away" | "offline";
  ring?: boolean;
}

export function MemberAvatar({
  name,
  avatarUrl,
  size = "md",
  showName = false,
  className,
  status,
  ring = false,
}: MemberAvatarProps) {
  const reduce = useReducedMotion();
  const pixels = SIZES[size];
  const ringSizes = { sm: 8, md: 10, lg: 12, xl: 16 } as const;

  const statusColors = {
    home: "bg-success",
    away: "bg-warning",
    offline: "bg-text-muted",
  };

  const AvatarContent = (
    <>
      {avatarUrl ? (
        <motion.img
          src={avatarUrl}
          alt=""
          width={pixels}
          height={pixels}
          className="rounded-full object-cover"
          initial={reduce ? false : { scale: 0.8, opacity: 0 }}
          animate={reduce ? false : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        />
      ) : (
        <motion.span
          aria-hidden
          style={{ width: pixels, height: pixels, fontSize: `${Math.round(pixels * 0.35)}px` }}
          className="inline-flex items-center justify-center rounded-full bg-surface-2 text-text-muted font-semibold"
          initial={reduce ? false : { scale: 0.8, opacity: 0 }}
          animate={reduce ? false : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {initials(name)}
        </motion.span>
      )}
      {status && ring && (
        <motion.span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-surface dark:border-surface",
            statusColors[status],
            {
              sm: "w-5 h-5",
              md: "w-6 h-6",
              lg: "w-7 h-7",
              xl: "w-9 h-9",
            }[size]
          )}
          initial={reduce ? false : { scale: 0 }}
          animate={reduce ? false : { scale: 1 }}
          transition={{ delay: 0.1, duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
        />
      )}
    </>
  );

  return (
    <span className={cn("inline-flex relative items-center gap-2", className)}>
      <span className="relative" style={{ width: pixels, height: pixels }}>
        {AvatarContent}
      </span>
      {showName ? <span className="truncate">{name}</span> : null}
    </span>
  );
}

export function AvatarStack({
  avatars,
  max = 4,
  size = "md",
  className,
}: {
  avatars: { name: string; avatarUrl?: string | null }[];
  max?: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pixels = SIZES[size];
  const overlap = size === "sm" ? -8 : size === "md" ? -10 : -12;

  const visible = avatars.slice(0, max);
  const remaining = avatars.length - max;

  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex -space-x-[10px]">
        {visible.map((avatar, index) => (
          <motion.span
            key={avatar.name}
            style={{ zIndex: visible.length - index }}
            className="relative"
            initial={reduce ? false : { x: -20, opacity: 0 }}
            animate={reduce ? false : { x: 0, opacity: 1 }}
            transition={{ delay: index * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <MemberAvatar name={avatar.name} avatarUrl={avatar.avatarUrl} size={size} />
          </motion.span>
        ))}
        {remaining > 0 && (
          <motion.span
            className="relative ml-[10px]"
            initial={reduce ? false : { scale: 0 }}
            animate={reduce ? false : { scale: 1 }}
            transition={{ delay: visible.length * 0.05, duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          >
            <span
              style={{ width: pixels, height: pixels }}
              className="inline-flex items-center justify-center rounded-full bg-primary text-primary-fg font-semibold text-[12px]"
            >
              +{remaining}
            </span>
          </motion.span>
        )}
      </div>
    </div>
  );
}