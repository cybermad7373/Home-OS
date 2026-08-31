"use client";

import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "./button-variants";
import { cn } from "@/lib/utils/cn";
import { MagneticButton } from "@/components/motion/MagneticButton";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

const magneticVariantMap: Record<NonNullable<VariantProps<typeof buttonVariants>["variant"]>, "primary" | "secondary" | "ghost" | "danger"> = {
  primary: "primary",
  secondary: "secondary",
  outline: "secondary",
  ghost: "ghost",
  danger: "danger",
  success: "primary",
};

const magneticSizeMap: Record<NonNullable<VariantProps<typeof buttonVariants>["size"]>, "sm" | "md" | "lg"> = {
  sm: "sm",
  md: "md",
  lg: "lg",
  icon: "md",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, loading, disabled, children, icon, iconPosition, ...props }, ref) => {
    const magneticVariant = magneticVariantMap[variant || "primary"];
    const magneticSize = magneticSizeMap[size || "md"];

    const isDisabled = Boolean(disabled || loading);

    if (variant === "outline" || variant === "ghost") {
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
          ) : null}
          {children}
        </button>
      );
    }

    return (
      <MagneticButton
        ref={ref}
        variant={magneticVariant}
        size={magneticSize}
        fullWidth={Boolean(block)}
        loading={Boolean(loading)}
        disabled={isDisabled}
        icon={icon}
        iconPosition={iconPosition}
        className={cn(className)}
        {...props}
      >
        {children}
      </MagneticButton>
    );
  },
);
Button.displayName = "Button";