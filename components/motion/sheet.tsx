"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduce ? undefined : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

interface SheetProps
  extends Omit<HTMLMotionProps<"div">, "initial" | "animate" | "exit" | "transition" | "title"> {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * What this sheet is. It was hardcoded to the literal word "Sheet" — and to
   * "Drawer" on the wide-screen variant — so every sheet in the app opened
   * with a heading naming the component rather than the task, above the real
   * title that the wrapper then rendered underneath. Add an expense, add a
   * meal, edit a member: all of them said "Sheet" first.
   */
  title?: ReactNode;
  side?: "bottom" | "right";
  size?: "sm" | "md" | "lg" | "full";
}

const sideOffsets = {
  bottom: { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } },
  right: { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } },
};

const sizeClasses = {
  sm: "max-h-[50vh] sm:max-h-[60vh]",
  md: "max-h-[70vh] sm:max-h-[80vh]",
  lg: "max-h-[85vh] sm:max-h-[90vh]",
  full: "max-h-[95vh]",
};

export function Sheet({
  open,
  onClose,
  children,
  title,
  side = "bottom",
  size = "md",
  className,
  ...props
}: SheetProps) {
  const reduce = useReducedMotion();
  const offsets = sideOffsets[side];
  // A sheet is a modal surface, and until 3.0 it said so to nobody: no role,
  // no `aria-modal`, and a title rendered as an ordinary heading the dialog was
  // not named by. A screen reader announced the page it was covering.
  const titleId = useId();

  if (!open) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:justify-end"
      initial={reduce ? undefined : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClose}
    >
      {/*
        `w-full` on a phone, auto above `lg`. As a flex item that is always
        full-width, this wrapper filled the row and left `lg:justify-end` on the
        container with nothing to push — so the 440px panel inside it sat at the
        *left* edge of the screen, vertically centred, on top of the sidebar
        navigation. The quick-add sheet covered Chores, Money, Food, Insights,
        Approvals and Notifications every time it opened on a desktop.
      */}
      <motion.div
        className="w-full bg-transparent lg:w-auto"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? undefined : offsets.initial}
        animate={offsets.animate}
        exit={reduce ? undefined : offsets.exit}
        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
        {...props}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            sizeClasses[size],
            "w-full overflow-hidden rounded-t-[2rem] bg-surface shadow-[var(--elev-4)] ring-1 ring-border lg:w-[440px] lg:rounded-l-[2rem]",
            className,
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border">
            <h2 id={titleId} className="heading-text">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="touch-target p-1 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="p-4 lg:p-6 overflow-y-auto">{children}</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface DrawerProps
  extends Omit<HTMLMotionProps<"div">, "initial" | "animate" | "exit" | "transition" | "title"> {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
}

export function Drawer({ open, onClose, children, title, className, ...props }: DrawerProps) {
  const reduce = useReducedMotion();
  const titleId = useId();

  if (!open) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-end"
      initial={reduce ? undefined : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "h-full w-full max-w-[480px] overflow-hidden bg-surface shadow-[var(--elev-4)] ring-1 ring-border",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? undefined : { x: "100%" }}
        animate={{ x: 0 }}
        exit={reduce ? undefined : { x: "100%" }}
        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
        {...props}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border">
          <h2 id={titleId} className="heading-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="touch-target p-1 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="h-[calc(100%-60px)] overflow-y-auto p-4 lg:p-6">{children}</div>
      </motion.div>
    </motion.div>
  );
}