"use client";

import { motion, useMotionValue, useTransform, useReducedMotion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface MagneticButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  loading?: boolean;
}

const variantClasses = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover active:bg-primary-hover",
  secondary: "bg-surface-2 text-text hover:bg-border active:bg-border ring-1 ring-border",
  ghost: "bg-transparent text-text hover:bg-surface-2 active:bg-surface-2",
  danger: "bg-danger text-white hover:bg-red-600 active:bg-red-700",
};

const sizeClasses = {
  sm: "px-3 py-1.5 text-[13px] gap-1.5",
  md: "px-5 py-2.5 text-[15px] gap-2",
  lg: "px-6 py-3 text-[15px] gap-2",
};

type ButtonForwardProps = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | "onClick"
  | "disabled"
  | "aria-label"
  | "aria-busy"
  | "type"
  | "form"
  | "formAction"
  | "formEncType"
  | "formMethod"
  | "formNoValidate"
  | "formTarget"
  | "name"
  | "value"
>;

export function MagneticButton(
  props: MagneticButtonProps & { ref?: React.Ref<HTMLButtonElement> }
) {
  const { children, icon, iconPosition = "right", variant = "primary", size = "md", fullWidth = false, loading, className, disabled, onClick, ref, ...rest } = props;
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const isHovered = useMotionValue(0);

  const iconX = useTransform(x, [-20, 20], [-4, 4]);
  const iconY = useTransform(y, [-20, 20], [-4, 4]);
  const iconScale = useTransform(isHovered, [0, 1], [1, 1.05]);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (reduce) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) * 0.15);
    y.set((e.clientY - centerY) * 0.15);
  };

  const handleMouseLeave = () => {
    if (reduce) return;
    x.set(0);
    y.set(0);
    isHovered.set(0);
  };

  const handleMouseEnter = () => {
    if (reduce) return;
    isHovered.set(1);
  };

  const buttonProps: ButtonForwardProps = {
    onClick,
    disabled: disabled || loading,
    "aria-label": rest["aria-label"],
    "aria-busy": loading,
    type: rest.type,
    form: rest.form,
    formAction: rest.formAction,
    formEncType: rest.formEncType,
    formMethod: rest.formMethod,
    formNoValidate: rest.formNoValidate,
    formTarget: rest.formTarget,
    name: rest.name,
    value: rest.value,
  };

  return (
    <motion.button
      ref={ref}
      className={`
        inline-flex items-center justify-center font-medium rounded-full
        transition-colors duration-150
        disabled:opacity-50 disabled:pointer-events-none
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? "w-full" : ""}
        ${className || ""}
      `}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      style={{ x, y }}
      {...buttonProps}
    >
      {loading ? (
        <motion.span
          className="flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </motion.span>
      ) : (
        <>
          {icon && iconPosition === "left" && (
            <motion.span
              style={{ x: iconX, y: iconY, scale: iconScale }}
              className="flex items-center justify-center"
            >
              {icon}
            </motion.span>
          )}
          <span className="relative z-10">{children}</span>
          {icon && iconPosition === "right" && (
            <motion.span
              style={{ x: iconX, y: iconY, scale: iconScale }}
              className="flex items-center justify-center"
            >
              {icon}
            </motion.span>
          )}
        </>
      )}
    </motion.button>
  );
}

interface PressableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  onPress?: () => void;
  scale?: number;
}

export function Pressable({
  children,
  onPress,
  scale = 0.98,
  className,
  onClick,
  ...props
}: PressableProps) {
  const reduce = useReducedMotion();

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!reduce) {
      e.currentTarget.animate(
        [{ transform: `scale(${scale})` }, { transform: "scale(1)" }],
        { duration: 80, easing: "ease-out" }
      );
    }
    onClick?.(e);
    onPress?.();
  };

  return (
    <div
      className={className}
      onClick={handleClick}
      {...props}
    >
      {children}
    </div>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  loading,
  className,
  ...props
}: IconButtonProps) {
  const sizeMap = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  return (
    <MagneticButton
      variant={variant}
      size={size}
      className={`${sizeMap[size]} p-0 ${className || ""}`}
      aria-label={label}
      loading={loading}
      {...props}
    >
      {icon}
    </MagneticButton>
  );
}

interface FloatingActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

export function FloatingActionButton({ icon, label, onClick, ...props }: FloatingActionButtonProps) {
  return (
    <MagneticButton
      variant="primary"
      size="lg"
      className="shadow-[var(--shadow-md)] fixed bottom-6 right-6 z-40 lg:hidden"
      onClick={onClick}
      aria-label={label}
      {...props}
    >
      {icon}
    </MagneticButton>
  );
}