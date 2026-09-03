import { MemberAvatar } from "@/components/ui/avatar";
import { ArrowRight } from "lucide-react";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

interface OwesRow {
  fromMemberId: string;
  toMemberId: string;
  fromName: string;
  toName: string;
  amountPaise: number;
}

/**
 * Who pays whom, as a list of sentences.
 *
 * The 2.0 version drew the same three rows twice: once as an animated SVG of
 * members on a circle with curved arrows between them, and again as the list
 * underneath — and each list row printed the amount twice, once as a caption
 * under the name and once on the right. The diagram is the part worth losing.
 * With three members it says less than the sentence does; with eight the
 * labels overlap and it says nothing at all. A transfer is a sentence — "you
 * owe Priya ₹1,240" — and a sentence is what it should look like.
 *
 * Colour follows the one rule in the system: red on a row you pay, green on a
 * row you are paid, ink on a row between two other people.
 */
export function HomeOwesWhom({
  owes,
  meId,
  currency,
}: {
  owes: OwesRow[];
  meId: string;
  currency: string;
}) {
  if (owes.length === 0) return null;

  const shown = owes.slice(0, 4);
  const remaining = owes.length - shown.length;

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      {shown.map((row) => {
        const iPay = row.fromMemberId === meId;
        const iAmPaid = row.toMemberId === meId;
        return (
          <li
            key={`${row.fromMemberId}-${row.toMemberId}`}
            className="flex items-center gap-3 px-4 py-3"
          >
            <MemberAvatar name={iPay ? "You" : row.fromName} size="sm" />
            <ArrowRight size={13} className="shrink-0 text-text-subtle" aria-hidden />
            <MemberAvatar name={iAmPaid ? "You" : row.toName} size="sm" />
            <p className="min-w-0 flex-1 truncate text-[15px]">
              <span className={cn(iPay && "font-medium")}>{iPay ? "You" : row.fromName}</span>
              <span className="text-text-muted">{iPay ? " owe " : " owes "}</span>
              <span className={cn(iAmPaid && "font-medium")}>{iAmPaid ? "you" : row.toName}</span>
            </p>
            <span
              className={cn(
                "readout shrink-0 text-[17px] leading-none",
                iPay ? "text-danger" : iAmPaid ? "text-success" : "text-text",
              )}
            >
              {formatMoney(row.amountPaise, { currency })}
            </span>
          </li>
        );
      })}
      {remaining > 0 ? (
        <li className="caption-text px-4 py-2.5 text-text-subtle">
          and {remaining} more {remaining === 1 ? "transfer" : "transfers"}
        </li>
      ) : null}
    </ul>
  );
}
