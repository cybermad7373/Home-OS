"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A bottom sheet on mobile, a right-side drawer at ≥1024 px. Dismisses by
 * backdrop tap or Escape — no modal traps (design principle 6).
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-stretch lg:justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-t-[14px] bg-surface p-4 shadow-[0_12px_32px_rgb(0_0_0/0.12)]",
          "lg:max-h-none lg:w-[420px] lg:rounded-none lg:rounded-l-[14px]",
        )}
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong lg:hidden" />
        <h2 className="title-text mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}
