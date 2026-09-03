"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { List, Section } from "@/components/layout/section";
import { useToast } from "@/components/ui/toast";
import type { ScheduleRunRow } from "@/lib/types/database";

interface Preview {
  week_start: string;
  totalPoints: number;
  assignedCount: number;
  openCount: number;
  maxDeviation: number;
  targets: { memberId: string; displayName: string; effectiveTarget: number }[];
}

/**
 * S-31 — schedule runs, and the button that makes one.
 *
 * The dry run exists because generating a week changes what eight people are
 * expected to do. Seeing the targets first, before publishing, is the
 * difference between a schedule the house accepts and one it argues with.
 */
export function GeneratePanel({
  runs,
  defaultWeekStart,
  isAdmin,
}: {
  runs: ScheduleRunRow[];
  defaultWeekStart: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);

    const response = await fetch("/api/chores/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_start: weekStart, dry_run: dryRun }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(body?.error?.message ?? "Generation did not run");
      return;
    }

    if (dryRun) {
      setPreview(body);
      return;
    }

    toast(
      `Week published. ${body.assignedCount} assigned${
        body.openCount > 0 ? `, ${body.openCount} left open` : ""
      }.`,
      "success",
    );
    setPreview(null);
    router.push(`/chores?week_start=${weekStart}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardTitle>Generate a week</CardTitle>
        <CardDescription>
          Runs automatically on Sunday evening. Regenerating a week replaces only what is
          still outstanding — anything done or confirmed is never touched, so nobody
          loses points they earned.
        </CardDescription>

        <div className="mt-3">
          <label className="label-text mb-1.5 block" htmlFor="week_start">
            Week beginning
          </label>
          <input
            id="week_start"
            type="date"
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
            className="h-11 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-[15px] text-text"
          />
        </div>

        {isAdmin ? (
          <div className="mt-3 flex gap-2">
            <Button variant="outline" block loading={busy} onClick={() => run(true)}>
              Preview
            </Button>
            <Button block loading={busy} onClick={() => run(false)}>
              Generate and publish
            </Button>
          </div>
        ) : (
          <p className="caption-text mt-3 text-text-muted">
            Only an admin can generate a week.
          </p>
        )}
      </Card>

      {preview ? (
        <Card>
          <CardTitle>
            {preview.totalPoints} points, {preview.assignedCount} chores
          </CardTitle>
          <CardDescription>
            Worst deviation from target: {preview.maxDeviation} points
            {preview.openCount > 0
              ? ` · ${preview.openCount} nobody can legally do`
              : " · everybody covered"}
          </CardDescription>

          <ul className="mt-3 divide-y divide-border">
            {preview.targets.map((target) => (
              <li
                key={target.memberId}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span>{target.displayName}</span>
                <span className="tabular text-[13px] font-medium">
                  {target.effectiveTarget} pts
                </span>
              </li>
            ))}
          </ul>

          <p className="caption-text mt-3 text-text-muted">
            Targets differ where somebody carried a surplus or a deficit from last week.
            Nothing has been published yet.
          </p>
        </Card>
      ) : null}

      <Section label="Past runs">
        {runs.length === 0 ? (
          <p className="caption-text text-text-muted">No week has been generated yet.</p>
        ) : (
          <List>
              {runs.map((runRow) => (
                <li
                  key={runRow.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="font-medium">Week of {runRow.week_start}</p>
                    <p className="caption-text text-text-muted">
                      {runRow.total_points} points · worst deviation{" "}
                      {runRow.max_deviation}
                      {runRow.unassigned_count > 0
                        ? ` · ${runRow.unassigned_count} open`
                        : ""}
                    </p>
                    {runRow.llm_rationale ? (
                      <p className="caption-text mt-1 text-text-subtle">
                        {runRow.llm_rationale}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone="neutral">
                    {runRow.generator === "llm"
                      ? runRow.llm_accepted
                        ? "AI accepted"
                        : "AI rejected"
                      : "Rule engine"}
                  </Badge>
                </li>
            ))}
          </List>
        )}
      </Section>
    </div>
  );
}
