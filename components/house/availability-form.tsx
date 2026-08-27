"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";

/**
 * S-07 — the seven-day availability capture, with the derived-windows preview.
 *
 * The preview is the point of the screen. "I'm out nine to seven" and "the
 * house can give you a forty-five minute job before nine or after seven" are
 * not obviously the same statement, and only the second is what the schedule
 * acts on. A member who sees an empty Tuesday here fixes their times; one who
 * never sees it finds out when a chore lands on a day they are never home.
 *
 * The screen also says plainly what being busy does and does not do, because
 * that is the rule people argue about afterwards.
 */

export interface AvailabilityDay {
  dayOfWeek: number;
  isHome: boolean;
  leavesAt: string | null;
  returnsAt: string | null;
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DAY_START_MIN = 6 * 60;
const DAY_END_MIN = 23 * 60;
const MIN_BUFFER_MIN = 15;

function toMinutes(time: string | null): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function format(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * The same derivation as lib/domain/scheduling/capacity.ts, run in the browser
 * so the preview updates as somebody types rather than after a round trip. The
 * server recomputes it from the stored rows; this copy is never authoritative.
 */
function windowsFor(day: AvailabilityDay): { label: string; minutes: number }[] {
  if (!day.isHome) return [];

  const leaves = toMinutes(day.leavesAt);
  const returns = toMinutes(day.returnsAt);
  if (leaves === null && returns === null) {
    return [
      {
        label: `${format(DAY_START_MIN)}–${format(DAY_END_MIN)}`,
        minutes: DAY_END_MIN - DAY_START_MIN,
      },
    ];
  }

  const windows: { label: string; minutes: number }[] = [];
  if (leaves !== null && leaves > DAY_START_MIN) {
    windows.push({
      label: `${format(DAY_START_MIN)}–${format(leaves)}`,
      minutes: leaves - DAY_START_MIN,
    });
  }
  if (returns !== null && returns < DAY_END_MIN) {
    windows.push({
      label: `${format(returns)}–${format(DAY_END_MIN)}`,
      minutes: DAY_END_MIN - returns,
    });
  }

  return windows.filter((window) => window.minutes >= MIN_BUFFER_MIN);
}

export function AvailabilityForm({
  initialDays,
  isOnboarding = false,
}: {
  initialDays: AvailabilityDay[];
  isOnboarding?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [days, setDays] = useState(initialDays);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const derived = useMemo(() => days.map(windowsFor), [days]);
  const weeklyMinutes = derived
    .flat()
    .reduce((sum, window) => sum + window.minutes, 0);

  function update(dayOfWeek: number, patch: Partial<AvailabilityDay>) {
    setDays((current) =>
      current.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day)),
    );
  }

  /** Weekday patterns are near-identical in practice; typing them seven times is not a feature. */
  function copyMondayToWeekdays() {
    const monday = days.find((day) => day.dayOfWeek === 1);
    if (!monday) return;
    setDays((current) =>
      current.map((day) =>
        day.dayOfWeek >= 1 && day.dayOfWeek <= 5
          ? { ...day, isHome: monday.isHome, leavesAt: monday.leavesAt, returnsAt: monday.returnsAt }
          : day,
      ),
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        days: days.map((day) => ({
          day_of_week: day.dayOfWeek,
          is_home: day.isHome,
          leaves_at: day.leavesAt || null,
          returns_at: day.returnsAt || null,
        })),
      }),
    });

    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body?.error?.message ?? "Something went wrong");
      return;
    }

    toast("Saved. The next schedule will use this.", "success");
    // Onboarding ends at the notification ask, not at the dashboard: the
    // reminders it asks about are timed against the week just entered, so the
    // promise it makes is one the app can already keep.
    router.push(isOnboarding ? "/onboarding/notify" : "/more");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="mb-4">
        <h1 className="title-text mb-1">When are you usually home?</h1>
        <p className="caption-text mb-4 text-text-muted">
          Roughly is fine — these are averages, not commitments. Being out a lot
          changes <em>which</em> chores you get, never how many points you owe.
        </p>

        {error ? (
          <div className="mb-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copyMondayToWeekdays}
          className="mb-4"
        >
          Copy Monday to all weekdays
        </Button>

        <ul className="flex flex-col gap-3">
          {days.map((day, index) => {
            const windows = derived[index];
            return (
              <li key={day.dayOfWeek} className="border-b border-border pb-3 last:border-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">{DAY_LABELS[day.dayOfWeek]}</span>
                  <label className="caption-text flex items-center gap-2 text-text-muted">
                    <input
                      type="checkbox"
                      checked={!day.isHome}
                      onChange={(event) =>
                        update(day.dayOfWeek, { isHome: !event.target.checked })
                      }
                    />
                    Away all day
                  </label>
                </div>

                {day.isHome ? (
                  <div className="flex items-center gap-2">
                    <label className="caption-text flex-1 text-text-muted">
                      Out at
                      <input
                        type="time"
                        value={day.leavesAt ?? ""}
                        onChange={(event) =>
                          update(day.dayOfWeek, { leavesAt: event.target.value || null })
                        }
                        className="mt-1 block w-full rounded-[10px] border border-border bg-surface px-2 py-1.5 text-base"
                        aria-label={`${DAY_LABELS[day.dayOfWeek]}: time you leave`}
                      />
                    </label>
                    <label className="caption-text flex-1 text-text-muted">
                      Back at
                      <input
                        type="time"
                        value={day.returnsAt ?? ""}
                        onChange={(event) =>
                          update(day.dayOfWeek, { returnsAt: event.target.value || null })
                        }
                        className="mt-1 block w-full rounded-[10px] border border-border bg-surface px-2 py-1.5 text-base"
                        aria-label={`${DAY_LABELS[day.dayOfWeek]}: time you get back`}
                      />
                    </label>
                  </div>
                ) : null}

                <p className="caption-text mt-2 text-text-muted">
                  {windows.length === 0
                    ? "Nothing can be assigned on this day."
                    : `Assignable: ${windows.map((window) => window.label).join(", ")}`}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mb-4">
        <p className="font-medium">
          {Math.round(weeklyMinutes / 60)} hours a week the house can call on
        </p>
        <p className="caption-text text-text-muted">
          Used to decide which chores fit your day. Your points target is the
          same as everybody else&rsquo;s.
        </p>
        <ul className="mt-3 flex flex-wrap gap-1">
          {days.map((day, index) => (
            <li
              key={day.dayOfWeek}
              className={`caption-text rounded-[8px] px-2 py-1 ${
                derived[index].length === 0
                  ? "bg-danger/10 text-danger"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {SHORT_LABELS[day.dayOfWeek]}
            </li>
          ))}
        </ul>
      </Card>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Saving…" : isOnboarding ? "Save and continue" : "Save"}
      </Button>
    </form>
  );
}
