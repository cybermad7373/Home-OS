"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils/date";

/**
 * S-08 — declaring a day.
 *
 * The screen exists so that telling the house the truth is easier than staying
 * quiet. Declaring an away day moves that day's chores to somebody else on the
 * spot and lowers the week's target proportionally; saying nothing and not
 * doing them turns into misses, a deficit and, at month end, money.
 */

export interface ExceptionItem {
  id: string;
  memberId: string;
  date: string;
  type: "away" | "home_all_day" | "custom_hours";
  leavesAt: string | null;
  returnsAt: string | null;
  reason: string | null;
  memberName: string;
}

const TYPE_LABEL: Record<ExceptionItem["type"], string> = {
  away: "Away all day",
  home_all_day: "Home all day",
  custom_hours: "Different hours",
};

export function AwayDays({
  initial,
  myMemberId,
  today,
  timezone,
}: {
  initial: ExceptionItem[];
  myMemberId: string;
  today: string;
  timezone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [date, setDate] = useState(today);
  const [type, setType] = useState<ExceptionItem["type"]>("away");
  const [leavesAt, setLeavesAt] = useState("");
  const [returnsAt, setReturnsAt] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function declare(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/availability/exceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exc_date: date,
        exc_type: type,
        leaves_at: type === "custom_hours" ? leavesAt || null : null,
        returns_at: type === "custom_hours" ? returnsAt || null : null,
        reason: reason.trim() || undefined,
      }),
    });

    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body?.error?.message ?? "Something went wrong");
      return;
    }

    const moved = body.redistribution?.reassigned?.length ?? 0;
    const opened = body.redistribution?.opened?.length ?? 0;

    toast(
      moved + opened === 0
        ? "Declared."
        : `Declared. ${moved} chore${moved === 1 ? "" : "s"} moved to somebody else` +
            (opened > 0 ? `, ${opened} left open for anyone to claim.` : "."),
      "success",
    );

    setReason("");
    setItems((current) => [
      ...current.filter((item) => !(item.memberId === myMemberId && item.date === date)),
      { ...body.exception, memberName: "You" },
    ]);
    router.refresh();
  }

  async function withdraw(id: string) {
    const response = await fetch(`/api/availability/exceptions/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const body = await response.json();
      toast(body?.error?.message ?? "Could not withdraw that", "danger");
      return;
    }

    setItems((current) => current.filter((item) => item.id !== id));
    // The chores are not pulled back: somebody has already been told they are
    // theirs. Anything still unclaimed is in the open pool.
    toast("Withdrawn. Chores already moved stay where they are.", "success");
    router.refresh();
  }

  const mine = items.filter((item) => item.memberId === myMemberId);
  const others = items.filter((item) => item.memberId !== myMemberId);

  return (
    <>
      <Card className="mb-4">
        <form onSubmit={declare} noValidate>
          <h2 className="mb-3 font-medium">Declare a day</h2>

          {error ? (
            <div className="mb-3">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}

          <div className="mb-3 flex gap-2">
            <label className="caption-text flex-1 text-text-muted">
              Date
              <input
                type="date"
                value={date}
                min={today}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1 block w-full rounded-[10px] border border-border bg-surface px-2 py-1.5 text-base"
              />
            </label>
            <label className="caption-text flex-1 text-text-muted">
              What
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ExceptionItem["type"])}
                className="mt-1 block w-full rounded-[10px] border border-border bg-surface px-2 py-1.5 text-base"
              >
                <option value="away">Away all day</option>
                <option value="home_all_day">Home all day</option>
                <option value="custom_hours">Different hours</option>
              </select>
            </label>
          </div>

          {type === "custom_hours" ? (
            <div className="mb-3 flex gap-2">
              <label className="caption-text flex-1 text-text-muted">
                Out at
                <input
                  type="time"
                  value={leavesAt}
                  onChange={(event) => setLeavesAt(event.target.value)}
                  className="mt-1 block w-full rounded-[10px] border border-border bg-surface px-2 py-1.5 text-base"
                />
              </label>
              <label className="caption-text flex-1 text-text-muted">
                Back at
                <input
                  type="time"
                  value={returnsAt}
                  onChange={(event) => setReturnsAt(event.target.value)}
                  className="mt-1 block w-full rounded-[10px] border border-border bg-surface px-2 py-1.5 text-base"
                />
              </label>
            </div>
          ) : null}

          <label className="caption-text mb-3 block text-text-muted">
            Why (optional)
            <input
              type="text"
              value={reason}
              maxLength={120}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Home for the weekend"
              className="mt-1 block w-full rounded-[10px] border border-border bg-surface px-2 py-1.5 text-base"
            />
          </label>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Saving…" : "Declare"}
          </Button>

          <p className="caption-text mt-3 text-text-muted">
            An away day moves that day&rsquo;s chores to somebody else and lowers
            your target for the week. It cannot be declared for a day that has
            already happened.
          </p>
        </form>
      </Card>

      <section className="mb-4">
        <h2 className="mb-2 font-medium">Yours</h2>
        {mine.length === 0 ? (
          <EmptyState
            title="Nothing declared"
            body="Tell the house before you go, not after."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {mine.map((item) => (
              <li key={item.id}>
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{formatDate(item.date, timezone)}</p>
                    <p className="caption-text text-text-muted">
                      {TYPE_LABEL[item.type]}
                      {item.type === "custom_hours" && item.leavesAt
                        ? ` · out ${item.leavesAt}${item.returnsAt ? `, back ${item.returnsAt}` : ""}`
                        : ""}
                      {item.reason ? ` · ${item.reason}` : ""}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => withdraw(item.id)}>
                    Withdraw
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 ? (
        <section>
          <h2 className="mb-2 font-medium">The rest of the house</h2>
          <ul className="flex flex-col gap-2">
            {others.map((item) => (
              <li key={item.id}>
                <Card>
                  <p className="font-medium">
                    {item.memberName} · {formatDate(item.date, timezone)}
                  </p>
                  <p className="caption-text text-text-muted">
                    {TYPE_LABEL[item.type]}
                    {item.reason ? ` · ${item.reason}` : ""}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
