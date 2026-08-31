"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";
import { motion, AnimatePresence } from "motion/react";
import { useMediaQuery } from "@/lib/utils/media-query";

type Tone = "neutral" | "success" | "danger" | "warning" | "info";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

// Backward compatible - both function call and object with push
type ToastContextValue = {
  (message: string, tone?: Tone): void;
  push: (message: string, options?: { tone?: Tone; action?: Toast["action"]; duration?: number }) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const TONES: Record<Tone, string> = {
  neutral: "bg-surface text-text border-border",
  success: "bg-success-bg text-success border-success/30",
  danger: "bg-danger-bg text-danger border-danger/30",
  warning: "bg-warning-bg text-warning border-warning/30",
  info: "bg-info-bg text-info border-info/30",
};

const ICONS: Record<Tone, React.ReactNode> = {
  neutral: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  danger: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");

  const push = useCallback((
    message: string,
    options: { tone?: Tone; action?: Toast["action"]; duration?: number } = {}
  ) => {
    const id = Date.now() + Math.random();
    const { tone = "neutral", action, duration = 4000 } = options;
    setToasts((current) => [...current, { id, message, tone, action, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, duration);
    }
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const contextValue = useMemo<ToastContextValue>(() => {
    const fn: ToastContextValue = (message: string, tone: Tone = "neutral") => {
      push(message, { tone });
    };
    fn.push = push;
    fn.dismiss = dismiss;
    return fn;
  }, [push, dismiss]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <AnimatePresence mode="popLayout">
        <div
          aria-live="polite"
          aria-atomic="true"
          className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:items-end lg:w-auto"
        >
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={false as any}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 100, y: -20 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "pointer-events-auto w-full max-w-sm rounded-[12px] border px-4 py-3 text-[14px] shadow-[var(--shadow-md)] flex items-start gap-3",
                TONES[toast.tone],
                "card-shell"
              )}
            >
              <div className="flex-shrink-0 mt-0.5 text-current">{ICONS[toast.tone]}</div>
              <div className="flex-1 min-w-0">{toast.message}</div>
              {toast.action && (
                <motion.button
                  onClick={() => { toast.action!.onClick(); dismiss(toast.id); }}
                  className="flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-medium bg-current/15 hover:bg-current/25 transition-colors"
                  whileTap={{ scale: 0.95 }}
                >
                  {toast.action.label}
                </motion.button>
              )}
              <motion.button
                onClick={() => dismiss(toast.id)}
                className="flex-shrink-0 p-1 rounded-full hover:bg-current/10 transition-colors -mr-1 -mt-1"
                whileTap={{ scale: 0.9 }}
                aria-label="Dismiss"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </motion.button>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
    </ToastContext.Provider>
  );
}