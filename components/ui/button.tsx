"use client";

import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "./button-variants";
import { cn } from "@/lib/utils/cn";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

/**
 * One button, one class list.
 *
 * Until 3.0 this component was two buttons wearing one name: `outline` and
 * `ghost` rendered a plain element from `buttonVariants`, and every other
 * variant was forwarded to `MagneticButton`, which carried its own padding
 * scale, its own focus ring and its own transition. So the primary button —
 * the one on nearly every screen — was 42 px tall against a 44 px minimum, its
 * small size was about 30 px, it announced focus with a coloured ring rather
 * than the app's ink outline, and it did not do the press the motion spec
 * describes. Half the buttons in the app were not built from the button system
 * at all, which is exactly the drift the system exists to prevent.
 *
 * The magnetic hover went with it. `buttonVariants` already encodes the press
 * the spec asks for — `scale(0.97)` over 70 ms — and a control that leans
 * toward the cursor is a flourish this interface decided against.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      block,
      loading,
      disabled,
      children,
      icon,
      iconPosition = "left",
      ...props
    },
    ref,
  ) => {
    const isDisabled = Boolean(disabled || loading);

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden
          />
        ) : icon && iconPosition === "left" ? (
          icon
        ) : null}
        {children}
        {!loading && icon && iconPosition === "right" ? icon : null}
      </button>
    );
  },
);
Button.displayName = "Button";
