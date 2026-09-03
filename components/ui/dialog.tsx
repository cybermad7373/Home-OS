"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";

/**
 * A modal dialog, on the platform's own `<dialog>` element.
 *
 * Using the real element rather than a div with `role="dialog"` buys three
 * things that are tedious and easy to get subtly wrong by hand: the focus trap,
 * the top layer (so no z-index in the app can ever paint over it), and Escape.
 * What it does not buy is a click-outside-to-close, because `::backdrop` is not
 * a child — hence the explicit check on the click target below.
 *
 * For anything a person chooses *from*, prefer the sheet: on a phone a sheet is
 * reachable with a thumb and a centred dialog is not. This is for the cases
 * where the app has to stop and ask.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        // Escape fires `cancel`; letting it close natively would leave React's
        // `open` prop out of step with the DOM.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // The backdrop is not a child, so a click on it lands on the dialog
        // itself. Anything inside stops at its own element.
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      aria-describedby={description ? "dialog-description" : undefined}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] rounded-[var(--radius-xl)] border border-border bg-surface p-0 text-text",
        "shadow-[var(--elev-4)] backdrop:bg-black/40 backdrop:backdrop-blur-[2px]",
        size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md",
      )}
    >
      <div className="flex items-start gap-4 border-b border-border p-5">
        <div className="min-w-0 flex-1">
          <h2 id="dialog-title" className="title-text">
            {title}
          </h2>
          {description ? (
            <p id="dialog-description" className="caption-text mt-1 text-text-muted">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="touch-target -m-2 flex items-center justify-center rounded-[var(--radius-sm)] text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      {children ? <div className="p-5">{children}</div> : null}

      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-2 p-4">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * The one thing a dialog is unambiguously for: stopping before something that
 * cannot be undone.
 *
 * The confirm label says what will happen — "Remove Deepak", not "OK" — because
 * a person who has stopped reading by the time they reach the buttons should
 * still be told what they are agreeing to.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
