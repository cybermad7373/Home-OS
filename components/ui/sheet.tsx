"use client";

import { useEffect, type ReactNode, forwardRef } from "react";
import { Sheet as MotionSheet, Drawer } from "@/components/motion/sheet";

/**
 * A bottom sheet on mobile, a right-side drawer at ≥1024 px. Dismisses by
 * backdrop tap or Escape — no modal traps (design principle 6).
 *
 * The title goes to the sheet's own header, next to the close button, rather
 * than being drawn a second time inside the content: the header used to say
 * "Sheet", and the real title sat under a grab handle below it.
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
      <Drawer ref={ref} open={open} onClose={onClose} title={title}>
        {children}
      </Drawer>
    );
  }

  return (
    <MotionSheet ref={ref} open={open} onClose={onClose} title={title} side="bottom" size={size}>
      {children}
    </MotionSheet>
  );
});
Sheet.displayName = "Sheet";

export const BottomSheet = Sheet;