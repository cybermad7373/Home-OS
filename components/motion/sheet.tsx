"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

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
      <motion.div
        className="w-full bg-transparent"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? undefined : offsets.initial}
        animate={offsets.animate}
        exit={reduce ? undefined : offsets.exit}
        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
        {...props}
      >
        <div className={`${sizeClasses[size]} w-full lg:w-[420px] bg-surface dark:bg-surface rounded-t-[2rem] lg:rounded-l-[2rem] shadow-[var(--shadow-elevated)] ring-1 ring-border dark:ring-border overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border">
            <h2 className="heading-text">{title}</h2>
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
        className="h-full w-full max-w-[480px] bg-surface dark:bg-surface shadow-[var(--shadow-elevated)] ring-1 ring-border dark:ring-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? undefined : { x: "100%" }}
        animate={{ x: 0 }}
        exit={reduce ? undefined : { x: "100%" }}
        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
        {...props}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border">
          <h2 className="heading-text">{title}</h2>
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