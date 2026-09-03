import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A table on a laptop and a stack of rows on a phone, from one definition.
 *
 * Eleven screens in this app show a list of things with two to five facts
 * each, and before this they each hand-rolled it — which is why some of them
 * had a table that scrolled the whole page sideways on a 360px screen and
 * others had cards that wasted two thirds of a 1280px one.
 *
 * The column definition carries `priority`, and that is the whole trick: on a
 * phone only the primary column and the numeric column are shown in the row's
 * top line, and the rest fall underneath as labelled pairs.
 */

export interface Column<Row> {
  key: string;
  header: string;
  /** Right-aligned and tabular. Use for anything that is a quantity. */
  numeric?: boolean;
  /** `primary` leads the row on a phone; `meta` is hidden until there is room. */
  priority?: "primary" | "normal" | "meta";
  width?: string;
  render: (row: Row) => React.ReactNode;
}

export function DataList<Row>({
  rows,
  columns,
  rowKey,
  empty,
  caption,
  onRowHref,
  className,
}: {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  empty?: React.ReactNode;
  caption?: string;
  onRowHref?: (row: Row) => string | undefined;
  className?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const primary = columns.find((column) => column.priority === "primary") ?? columns[0];
  const numeric = columns.find((column) => column.numeric);
  const rest = columns.filter((column) => column !== primary && column !== numeric);

  return (
    <div className={className}>
      {/* ---- phone: a stack of rows ---- */}
      <ul className="flex flex-col gap-2 lg:hidden">
        {rows.map((row) => {
          const href = onRowHref?.(row);
          const body = (
            <div
              className={cn(
                "rounded-[var(--radius-md)] border border-border bg-surface p-3",
                href && "card-interactive",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">{primary.render(row)}</div>
                {numeric ? (
                  <div className="tabular shrink-0 text-right font-medium">{numeric.render(row)}</div>
                ) : null}
              </div>
              {rest.length > 0 ? (
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {rest.map((column) => (
                    <div key={column.key} className="flex min-w-0 items-baseline gap-1.5">
                      <dt className="caption-text shrink-0 text-text-subtle">{column.header}</dt>
                      <dd className="caption-text min-w-0 truncate text-text-muted">
                        {column.render(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          );

          return (
            <li key={rowKey(row)}>
              {href ? (
                <a href={href} className="block">
                  {body}
                </a>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>

      {/* ---- laptop: a real table ---- */}
      <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface lg:block">
        <table className="w-full border-collapse text-[14px]">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    "eyebrow-text border-b border-border bg-surface-2 px-4 py-2.5 text-left whitespace-nowrap",
                    column.numeric && "text-right",
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = onRowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    href && "transition-colors hover:bg-surface-2",
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-4 py-3 align-top",
                        column.numeric && "tabular text-right",
                        column.priority === "meta" && "text-text-muted",
                      )}
                    >
                      {href && column === primary ? (
                        <a href={href} className="hover:underline">
                          {column.render(row)}
                        </a>
                      ) : (
                        column.render(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * A key-value block — the other half of what those eleven screens were doing by
 * hand. Two columns on a laptop, one on a phone, and the value is allowed to be
 * a component rather than a string.
 */
export function DefinitionList({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; hint?: string }[];
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5">
          <dt className="eyebrow-text">{item.label}</dt>
          <dd className="text-[15px]">{item.value}</dd>
          {item.hint ? <p className="caption-text text-text-muted">{item.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}
