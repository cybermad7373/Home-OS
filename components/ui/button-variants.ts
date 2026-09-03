import { cva } from "class-variance-authority";

/**
 * Kept apart from `button.tsx` so that server components can build a link that
 * looks like a button without pulling a client module into the server graph.
 *
 * Pills, and no shadow on any of them. In a monochrome system a button is
 * distinguished by fill and shape rather than by hue, so the shape has to be
 * unambiguous: a full radius says "control", a hairline rectangle says
 * "container", and nothing in the app is both.
 *
 * `primary` is ink — black on white, white on black. There is no brand hue to
 * spend, which means the two variants that *are* coloured, `danger` and
 * `success`, are the only coloured buttons in the app and read as outcomes
 * rather than as emphasis.
 */
export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-full",
    "font-medium tracking-[-0.01em] whitespace-nowrap",
    "transition-[background-color,color,border-color,opacity,transform]",
    "duration-[var(--duration-fast)] ease-[var(--ease-out)]",
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-primary-hover",
        secondary: "bg-surface-2 text-text hover:bg-surface-3",
        outline: "border border-border-strong bg-transparent text-text hover:bg-surface-2",
        ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
        danger: "bg-danger text-white hover:opacity-85",
        success: "bg-success text-white hover:opacity-85",
      },
      size: {
        sm: "h-9 px-4 text-[13px]",
        md: "h-11 px-5 text-[15px]",
        lg: "h-13 px-7 text-[15px]",
        icon: "h-11 w-11 p-0",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);
