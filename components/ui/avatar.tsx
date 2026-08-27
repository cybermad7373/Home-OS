import Image from "next/image";
import { cn } from "@/lib/utils/cn";

const SIZES = { sm: 28, md: 36, lg: 48 } as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function MemberAvatar({
  name,
  avatarUrl,
  size = "md",
  showName = false,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
  showName?: boolean;
  className?: string;
}) {
  const pixels = SIZES[size];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={pixels}
          height={pixels}
          className="rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          style={{ width: pixels, height: pixels }}
          className="inline-flex items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-text-muted"
        >
          {initials(name)}
        </span>
      )}
      {showName ? <span className="truncate">{name}</span> : null}
    </span>
  );
}
