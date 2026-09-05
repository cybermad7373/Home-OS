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
  /**
   * The action the sheet exists for, pinned to the bottom where it cannot
   * scroll away.
   *
   * This is not decoration. The add-expense sheet is a keypad, nine category
   * chips, a date, a payer, a split, a note and a receipt field, and its Save
   * button sat at y≈900 inside a panel 410–591px tall. It was reachable — the
   * body scrolls — and it was never *visible* when the sheet opened, on any
   * viewport tested including a phone. The most common report about this app
   * was that things could be filled in and not saved, and this was why.
   */
  footer?: ReactNode;
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
  footer,
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
          /*
            A flex column, so the body is the only part that scrolls and the
            header and footer stay put. It used to be an ordinary block whose
            body div was taller than the panel: the panel clipped it, the body
            scrolled, and anything at the end of the content — which on this
            product means the Save button — opened out of sight.
          */
          className={cn(
            sizeClasses[size],
            "flex w-full flex-col overflow-hidden rounded-t-[2rem] bg-surface shadow-[var(--elev-4)] ring-1 ring-border lg:w-[440px] lg:rounded-l-[2rem]",
            className,
          )}
        >
          <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border dark:border-border">
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
          {/* `min-h-0` is what lets a flex child actually shrink and scroll;
              without it the body keeps its content height and the footer is
              pushed out of the panel again. */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">{children}</div>

          {footer ? (
            <div
              className="shrink-0 border-t border-border bg-surface px-4 py-3 lg:px-6"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              {footer}
            </div>
          ) : null}
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
  /** Same contract as `Sheet`: the action, pinned where it cannot scroll away. */
  footer?: ReactNode;
}

export function Drawer({
  open,
  onClose,
  children,
  title,
  footer,
  className,
  ...props
}: DrawerProps) {
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
          "flex h-full w-full max-w-[480px] flex-col overflow-hidden bg-surface shadow-[var(--elev-4)] ring-1 ring-border",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? undefined : { x: "100%" }}
        animate={{ x: 0 }}
        exit={reduce ? undefined : { x: "100%" }}
        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
        {...props}
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border dark:border-border">
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
        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-border bg-surface px-4 py-3 lg:px-6">
            {footer}
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}