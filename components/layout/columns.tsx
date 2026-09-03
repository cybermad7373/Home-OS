import { cn } from "@/lib/utils/cn";

/**
 * The desktop composition.
 *
 * Until now there was none: the app rendered one column and let it stretch, so
 * a 1280px screen got the phone layout with 700px of air in the middle of
 * every row — a list whose label sat on the far left and whose value sat on the
 * far right, with nothing between them. That is the standard failure of a
 * responsive build that only ever widens.
 *
 * So a screen declares two things instead of one: what it is *about*, and what
 * is *beside* it. Below `lg` they stack in that order, which is the phone
 * reading order and the one the screens were designed in. At `lg` the aside
 * becomes a fixed 340px rail and the main column takes what is left, so the
 * measure of a paragraph and the width of a list row both stay in the range a
 * person can actually read.
 *
 * The rail is deliberately not a dumping ground. What belongs in it is what a
 * person glances at — counts, standing, who is here — and what belongs in the
 * main column is what they came to read.
 */
export function Columns({
  main,
  aside,
  asideFirst = false,
  className,
}: {
  main: React.ReactNode;
  aside: React.ReactNode;
  /**
   * Put the rail above the main column when they stack.
   *
   * The two columns are a desktop idea; on a phone there is only an order, and
   * it is not always the same one. Today's rail is context you glance past on
   * the way to your chores, so it goes second. Money's rail holds the two
   * figures the screen opens with, so it goes first. The `lg` layout is
   * identical either way.
   */
  asideFirst?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10",
        className,
      )}
    >
      <div className={cn("min-w-0", asideFirst && "order-2 lg:order-none")}>{main}</div>
      {/* Sticky, because the rail is reference material for whatever is being
          scrolled through beside it. `top` clears the app header. */}
      <aside
        className={cn(
          "min-w-0 lg:sticky lg:top-[72px] lg:mt-0",
          asideFirst ? "order-1 mb-2 lg:order-none lg:mb-0" : "mt-8",
        )}
      >
        {aside}
      </aside>
    </div>
  );
}

/**
 * A collection of cards that should be one column on a phone and several on a
 * desktop. Used where the items are objects rather than rows — homes, rooms,
 * guests, categories — because a card 1100px wide holding two lines of text is
 * not a card, it is a banner.
 */
export function CardGrid({
  children,
  className,
  min = "18rem",
}: {
  children: React.ReactNode;
  className?: string;
  /** The narrowest a card may get before the grid drops a column. */
  min?: string;
}) {
  return (
    <div
      className={cn("grid gap-3", className)}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}
