"use client";

import { useEffect, type ReactNode, forwardRef } from "react";
import { cn } from "@/lib/utils/cn";
import { Sheet as MotionSheet, Drawer } from "@/components/motion/sheet";

/**
 * A bottom sheet on mobile, a right-side drawer at ≥1024 px. Dismisses by
 * backdrop tap or Escape — no modal traps (design principle 6).
 */
export const Sheet = forwardRef<HTMLDivElement, {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: "bottom" | "right";
  size?: "sm" | "md" | "lg" | "full";
}>(({ open, onClose, title, children, side = "bottom", size = "md" }, ref) => {
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

  if (side === "right") {
    return (
      <Drawer ref={ref} open={open} onClose={onClose}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong hidden lg:block" />
        <h2 className="title-text mb-4">{title}</h2>
        {children}
      </Drawer>
    );
  }

  return (
    <MotionSheet ref={ref} open={open} onClose={onClose} side="bottom" size={size}>
      <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong lg:hidden" />
      <h2 className="title-text mb-4">{title}</h2>
      {children}
    </MotionSheet>
  );
});
Sheet.displayName = "Sheet";

export const BottomSheet = Sheet;