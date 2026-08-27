import { cva } from "class-variance-authority";

/**
 * Kept apart from `button.tsx` so that server components can build a link that
 * looks like a button without pulling a client module into the server graph.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-[background-color,color,transform] duration-75 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-primary-hover",
        secondary: "bg-surface-2 text-text hover:bg-border",
        outline: "border border-border-strong bg-surface text-text hover:bg-surface-2",
        ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
        danger: "bg-danger text-white hover:opacity-90",
        success: "bg-success text-white hover:opacity-90",
      },
      size: {
        sm: "h-9 px-3 text-[13px]",
        md: "h-11 px-4 text-[15px]",
        lg: "h-12 px-5 text-[15px]",
        icon: "h-11 w-11",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);
