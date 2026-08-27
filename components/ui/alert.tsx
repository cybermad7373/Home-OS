import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const TONES = {
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-[10px] px-3 py-2.5 text-[13px] leading-5", TONES[tone], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}
