import { cn } from "@/lib/utils/cn";

/** Skeletons match the real layout's shape, so nothing shifts when data lands. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[10px] bg-surface-2", className)} />;
}
