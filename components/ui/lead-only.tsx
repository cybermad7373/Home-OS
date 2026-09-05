import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils/cn";

/**
 * Saying no out loud.
 *
 * The app used to enforce a role by disappearance. A member on `/house/rooms`
 * saw the rooms and no Add a room; a member who typed `/admin/settings` was
 * redirected to `/more` without a word, so the screen they asked for was
 * silently replaced by a different one. Nothing anywhere said "a lead does
 * this" — so the honest reading of the product was that it had not been
 * finished, which is exactly what people concluded.
 *
 * The gate itself was never the problem and has not moved: the API refuses the
 * write and the RLS policy refuses it again, so what renders here is
 * presentation and nothing else. What changed is that presentation now
 * includes the reason.
 */

/**
 * Who is being named, in the words the rest of the app uses.
 *
 * The distinction is real and the copy has to keep it: `isAdmin` is the admin
 * alone, `isLead` is the admin and the co-admins. Telling a co-admin that only
 * an admin or co-admin may do the thing they have just been refused would be
 * worse than saying nothing.
 */
export type Authority = "admin" | "lead";

const WHO: Record<Authority, string> = {
  admin: "the admin of this home",
  lead: "an admin or co-admin of this home",
};

/**
 * The control a member cannot use, drawn as a control they cannot use.
 *
 * Disabled rather than absent, with the reason under it. A control that is
 * greyed out teaches the shape of the product; a control that was never
 * rendered teaches that the product has no such feature.
 */
export function LeadOnlyAction({
  label,
  what,
  who = "lead",
  className,
  block = true,
}: {
  /** The button's own words — "Add a room". */
  label: string;
  /** The thing being refused, in a sentence — "add a room". */
  what: string;
  /** Which gate refused it. Must match the check the caller made. */
  who?: Authority;
  className?: string;
  block?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Button variant="outline" block={block} disabled>
        {label}
      </Button>
      <p className="caption-text flex items-start gap-1.5 text-text-muted">
        <Lock size={13} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          Only {WHO[who]} can {what}.{" "}
          {who === "admin" ? "Ask them." : "Ask one of them."}
        </span>
      </p>
    </div>
  );
}

/**
 * A whole screen a member may not have.
 *
 * Replaces `redirect("/more")`. A redirect answers "where am I" with a
 * different screen and no explanation, and the two admin settings screens did
 * exactly that — the most confusing thing the app did to somebody exploring it.
 */
export function LeadOnlyPage({
  title,
  what,
  who = "admin",
  backHref = "/more",
  backLabel = "Back to More",
}: {
  title: string;
  /** What the screen is for, in a sentence — "change how this home works". */
  what: string;
  /** Which gate refused it. Must match the check the caller made. */
  who?: Authority;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 py-10">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-text-muted">
        <Lock size={18} aria-hidden />
      </span>
      <h1 className="title-text">{title}</h1>
      <p className="text-text-muted">
        This screen is where {WHO[who]} can {what}. You can see everything the
        home has decided; changing it is theirs to do.
      </p>
      <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
        {backLabel}
      </Link>
    </div>
  );
}
