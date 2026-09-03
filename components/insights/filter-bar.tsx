import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import type { InsightType } from "@/lib/domain/insights";

/**
 * The filter bar for the one insights screen (phase 15).
 *
 * Links rather than a client component, for the same reason the Calendar's
 * segmented control is: every filter changes what the server reads, and a URL
 * that carries the whole view is one a member can send to their Home.
 */

export interface FilterState {
  type: InsightType;
  period: string;
  granularity: string;
  months: number;
  category?: string;
  member?: string;
}

const TYPES: { key: InsightType; label: string }[] = [
  { key: "money", label: "Money" },
  { key: "chores", label: "Chores" },
  { key: "food", label: "Food" },
  { key: "home", label: "Home" },
];

const GRANULARITIES: { key: string; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

export function hrefFor(state: FilterState, changes: Partial<FilterState>): string {
  const next = { ...state, ...changes };
  const params = new URLSearchParams({
    type: next.type,
    period: next.period,
    granularity: next.granularity,
    months: String(next.months),
  });
  if (next.category) params.set("category", next.category);
  if (next.member) params.set("member", next.member);
  return `/insights?${params.toString()}`;
}

export function FilterBar({
  state,
  categories,
  members,
}: {
  state: FilterState;
  categories: { id: string; name: string }[];
  members: { memberId: string; displayName: string }[];
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <Segmented
        label="Insight type"
        options={TYPES.map((type) => ({
          key: type.key,
          label: type.label,
          href: hrefFor(state, { type: type.key }),
          current: state.type === type.key,
        }))}
      />

      {/* Grouping and range share a row, and at 360px that row is 328px wide.
          Two equal halves truncate every label to "We…" and "1 m…", so the
          range control takes only the width its three short labels need. */}
      <div className="flex items-center gap-2">
        <Segmented
          label="Grouping"
          options={GRANULARITIES.map((granularity) => ({
            key: granularity.key,
            label: granularity.label,
            href: hrefFor(state, { granularity: granularity.key }),
            current: state.granularity === granularity.key,
          }))}
        />
        <Segmented
          label="Range"
          grow={false}
          options={[1, 3, 6].map((months) => ({
            key: String(months),
            label: `${months}M`,
            href: hrefFor(state, { months }),
            current: state.months === months,
          }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        {/* Money is the only view a category means anything in. */}
        {state.type === "money" && categories.length > 0 ? (
          <Chips
            label="Category"
            allLabel="All"
            allHref={hrefFor(state, { category: undefined })}
            allCurrent={!state.category}
            options={categories.map((category) => ({
              key: category.id,
              label: category.name,
              href: hrefFor(state, { category: category.id }),
              current: state.category === category.id,
            }))}
          />
        ) : null}

        {/* The Home view is about the Home, so narrowing it to one person
            would answer a different question than the one it asks. */}
        {state.type !== "home" ? (
          <Chips
            label="Person"
            allLabel="Everyone"
            allHref={hrefFor(state, { member: undefined })}
            allCurrent={!state.member}
            options={members.map((member) => ({
              key: member.memberId,
              label: member.displayName,
              href: hrefFor(state, { member: member.memberId }),
              current: state.member === member.memberId,
            }))}
          />
        ) : null}
      </div>
    </div>
  );
}

function Segmented({
  label,
  options,
  grow = true,
}: {
  label: string;
  options: { key: string; label: string; href: string; current: boolean }[];
  /** A control with short labels should not be stretched to half the row. */
  grow?: boolean;
}) {
  return (
    <nav aria-label={label} className={grow ? "min-w-0 flex-1" : "shrink-0"}>
      <ul className="flex gap-1 rounded-full border border-border p-1">
        {options.map((option) => (
          <li key={option.key} className={grow ? "min-w-0 flex-1" : "shrink-0"}>
            <Link
              href={option.href}
              aria-current={option.current ? "page" : undefined}
              className={cn(
                "flex h-9 items-center justify-center rounded-full text-[14px] transition-colors",
                grow ? "px-2.5" : "px-3",
                option.current
                  ? "bg-primary font-medium text-primary-fg"
                  : "text-text-muted hover:text-text",
              )}
            >
              <span className="truncate">{option.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Chips({
  label,
  allLabel,
  allHref,
  allCurrent,
  options,
}: {
  label: string;
  allLabel: string;
  allHref: string;
  allCurrent: boolean;
  options: { key: string; label: string; href: string; current: boolean }[];
}) {
  return (
    // One scrolling row rather than a wrapping block: eight members wrapped to
    // four rows of chips, which pushed the figures the screen is about below
    // the fold on a phone.
    <nav aria-label={label} className="min-w-0">
      <ul className="scroll-x flex items-center gap-1.5">
        <li className="eyebrow-text shrink-0 pr-1">{label}</li>
        <li className="shrink-0">
          <Chip href={allHref} current={allCurrent} label={allLabel} />
        </li>
        {options.map((option) => (
          <li key={option.key} className="shrink-0">
            <Chip href={option.href} current={option.current} label={option.label} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Chip({ href, current, label }: { href: string; current: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={current ? "true" : undefined}
      className={
        current
          ? "block max-w-[10rem] truncate rounded-full border border-primary bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-fg"
          : "block max-w-[10rem] truncate rounded-full border border-border px-3 py-1.5 text-[13px] text-text-muted transition-colors hover:border-border-strong hover:text-text"
      }
    >
      {label}
    </Link>
  );
}
