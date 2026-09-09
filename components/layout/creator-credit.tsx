import { cn } from "@/lib/utils/cn";

/**
 * Who made this, at the very bottom of every shell.
 *
 * One component so the wording cannot drift between the four places it
 * appears: the sign-in shell, the legal documents, the desktop sidebar and
 * the More screen that is the phone's equivalent of a footer.
 */
export function CreatorCredit({ className }: { className?: string }) {
  return (
    <p className={cn("caption-text text-text-subtle", className)}>
      Created by Ruthra · MIT licensed
    </p>
  );
}
