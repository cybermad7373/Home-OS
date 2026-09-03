"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The app's one on/off control.
 *
 * There were four of them before this. House settings used a `Button` with
 * `aria-pressed` whose label was the word "On" or "Off" — so the control read
 * as an action, and pressing a button labelled "On" to turn something off is
 * the wrong sentence. Notification preferences used a native checkbox tinted
 * with `accent-color`, which is a browser's idea of a tick box and not this
 * system's. AI capabilities used a native checkbox with `role="switch"` on it,
 * tinted through `--color-primary`, a token that only exists inside Tailwind's
 * `@theme` block and therefore resolved to nothing in the accent property.
 *
 * A switch is a state, not a verb: it shows where the setting *is*. In a
 * monochrome system that means fill — ink when on, paper with a hairline when
 * off — because there is no brand hue to signal with. The focus ring is the
 * global one, which is deliberately thicker than usual for the same reason.
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  describedBy,
  id,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Used when the switch has no visible label beside it. */
  label?: string;
  describedBy?: string;
  id?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full border",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]",
        "disabled:pointer-events-none disabled:opacity-40",
        checked ? "border-primary bg-primary" : "border-border-strong bg-surface-2",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute h-[18px] w-[18px] rounded-full",
          "transition-[left,background-color] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
          checked ? "left-[24px] bg-primary-fg" : "left-[2px] bg-border-strong",
        )}
      />
    </button>
  );
}

/**
 * A settings row: what the setting is, what it does, and where it stands.
 *
 * Written once because every settings surface in the app was writing it out by
 * hand and they had drifted — three paddings, two type sizes, and a hit area
 * that was the checkbox alone on one screen and the whole row on another. Here
 * the label is a `<label>`-shaped hit area of its own: tapping the words works,
 * which on a phone is the difference between a setting people change and one
 * they give up on.
 *
 * `locked` is the row that cannot be turned off — settlement, and decisions
 * waiting on you. It is shown rather than hidden (D-30): a member is entitled
 * to know that one category cannot be muted *before* they owe somebody money.
 */
export function SwitchRow({
  label,
  help,
  checked,
  onChange,
  disabled = false,
  locked = false,
  className,
}: {
  label: string;
  help?: string;
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  locked?: boolean;
  className?: string;
}) {
  const id = `sw-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <li className={cn("flex items-center justify-between gap-4 px-4 py-3", className)}>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-medium">
          {locked ? <Lock size={13} aria-hidden className="text-text-subtle" /> : null}
          {locked ? (
            label
          ) : (
            <label
              htmlFor={id}
              className="cursor-pointer"
              onClick={(event) => {
                // The switch is a `<button>`, so `htmlFor` does not activate it
                // the way it would a checkbox. Forwarding the click keeps the
                // words a hit area without making the row itself clickable —
                // a row that toggles when you tap the help text is a row that
                // toggles by accident.
                event.preventDefault();
                if (!disabled) onChange?.(!checked);
              }}
            >
              {label}
            </label>
          )}
        </p>
        {help ? (
          <p id={`${id}-help`} className="caption-text text-text-muted">
            {help}
          </p>
        ) : null}
      </div>

      {locked ? (
        <span className="eyebrow-text shrink-0">Always on</span>
      ) : (
        <Switch
          id={id}
          checked={Boolean(checked)}
          onChange={(next) => onChange?.(next)}
          disabled={disabled}
          label={label}
          describedBy={help ? `${id}-help` : undefined}
        />
      )}
    </li>
  );
}
