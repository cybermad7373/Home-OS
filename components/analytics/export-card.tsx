import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EXPORT_TYPES, type ExportType } from "@/lib/domain/analytics/csv";

/**
 * Export as CSV from every tab (docs/08-UI-UX-SPEC.md section 4.6, AN-06).
 *
 * Plain links rather than fetches: the route already answers with the content
 * type and filename, so the browser saves the file without any JavaScript, and
 * the card stays a server component.
 */

const LABELS: Record<ExportType, { title: string; hint: string; scoped: "period" | "months" }> = {
  expenses: { title: "Expenses", hint: "Every expense this month", scoped: "period" },
  spend: { title: "Spend by category", hint: "Category totals per month", scoped: "months" },
  members: { title: "Paid vs fair share", hint: "Per member, this month", scoped: "period" },
  effort: { title: "Effort concentration", hint: "Top three share per month", scoped: "months" },
  budgets: { title: "Budgets", hint: "Category budgets this month", scoped: "period" },
};

export function ExportCard({ period, months }: { period: string; months: number }) {
  return (
    <Card>
      <CardTitle>Export</CardTitle>
      <CardDescription>Download as CSV — opens in any spreadsheet.</CardDescription>
      <ul className="mt-4 flex flex-col gap-2">
        {EXPORT_TYPES.map((type) => {
          const label = LABELS[type];
          const scope =
            label.scoped === "period" ? `period=${period}` : `months=${months}`;
          return (
            <li key={type} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{label.title}</p>
                <p className="caption-text truncate text-text-muted">{label.hint}</p>
              </div>
              <a
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={`/api/analytics/export?type=${type}&${scope}`}
                download
              >
                CSV
              </a>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
