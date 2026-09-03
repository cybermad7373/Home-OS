"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils/date";

/**
 * S-09 — registering a guest.
 *
 * The screen is deliberately blunt about what registering one costs, because
 * the alternative is hosts quietly not registering them: a guest is an extra
 * head in the food split on the days they are here, and their share of the
 * common work goes on their host.
 */

export interface GuestItem {
  id: string;
  name: string;
  hostMemberId: string;
  hostName: string;
  fromDate: string;
  toDate: string;
  countsForExpense: boolean;
  isAssignable: boolean;
}

export function GuestList({
  initial,
  myMemberId,
  isAdmin,
  today,
  timezone,
}: {
  initial: GuestItem[];
  myMemberId: string;
  isAdmin: boolean;
  today: string;
  timezone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [guests, setGuests] = useState(initial);
  const [name, setName] = useState("");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [countsForExpense, setCountsForExpense] = useState(true);
  const [isAssignable, setIsAssignable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function register(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/guests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        from_date: fromDate,
        to_date: toDate,
        counts_for_expense: countsForExpense,
        is_assignable: isAssignable,
      }),
    });

    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(
        body?.error?.details?.fields?.to_date ??
          body?.error?.details?.fields?.name ??
          body?.error?.message ??
          "Something went wrong",
      );
      return;
    }

    const addedPoints = (body.chores?.added ?? []).reduce(
      (sum: number, day: { points: number }) => sum + day.points,
      0,
    );

    toast(
      addedPoints > 0
        ? `${body.name} registered. ${addedPoints} points of work added to you.`
        : `${body.name} registered.`,
      "success",
    );

    setGuests((current) => [...current, body]);
    setName("");
    router.refresh();
  }

  async function cancel(id: string) {
    const response = await fetch(`/api/guests/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      toast(body?.error?.message ?? "Could not cancel that", "danger");
      return;
    }
    setGuests((current) => current.filter((guest) => guest.id !== id));
    toast("Cancelled. Splits already computed do not change.", "success");
    router.refresh();
  }

  return (
    <>
      <Card className="mb-4">
        <form onSubmit={register} noValidate>
          <h2 className="mb-3 font-medium">Register a guest</h2>

          {error ? (
            <div className="mb-3">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}

          <label className="caption-text mb-3 block text-text-muted">
            Name
            <input
              type="text"
              value={name}
              maxLength={50}
              onChange={(event) => setName(event.target.value)}
              placeholder="Arjun"
              className="mt-1 block w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1.5 text-base"
            />
          </label>

          <div className="mb-3 flex gap-2">
            <label className="caption-text flex-1 text-text-muted">
              First night
              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  if (event.target.value > toDate) setToDate(event.target.value);
                }}
                className="mt-1 block w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1.5 text-base"
              />
            </label>
            <label className="caption-text flex-1 text-text-muted">
              Last night
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(event) => setToDate(event.target.value)}
                className="mt-1 block w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1.5 text-base"
              />
            </label>
          </div>

          <label className="caption-text mb-2 flex items-center gap-2 text-text-muted">
            <input
              type="checkbox"
              checked={countsForExpense}
              onChange={(event) => setCountsForExpense(event.target.checked)}
            />
            They eat here — count them in the food split, billed to you
          </label>

          <label className="caption-text mb-4 flex items-center gap-2 text-text-muted">
            <input
              type="checkbox"
              checked={isAssignable}
              onChange={(event) => setIsAssignable(event.target.checked)}
            />
            They add to the housework — their share goes on you
          </label>

          <Button type="submit" disabled={loading || name.trim().length < 2} className="w-full">
            {loading ? "Saving…" : "Register"}
          </Button>

          <p className="caption-text mt-3 text-text-muted">
            Both costs land on you, not on the house. At most 30 nights, and no
            more than a week in the past.
          </p>
        </form>
      </Card>

      {guests.length === 0 ? (
        <EmptyState title="Nobody staying" body="Register a guest before they arrive." />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {guests
            .slice()
            .sort((a, b) => a.fromDate.localeCompare(b.fromDate))
            .map((guest) => (
              <li key={guest.id}>
                <Card className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{guest.name}</p>
                    <p className="caption-text text-text-muted">
                      {formatDate(guest.fromDate, timezone)}
                      {guest.toDate !== guest.fromDate
                        ? ` – ${formatDate(guest.toDate, timezone)}`
                        : ""}{" "}
                      · hosted by {guest.hostMemberId === myMemberId ? "you" : guest.hostName}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {guest.countsForExpense ? <Badge>In the food split</Badge> : null}
                      {guest.isAssignable ? <Badge>Adds chores</Badge> : null}
                    </div>
                  </div>
                  {guest.hostMemberId === myMemberId || isAdmin ? (
                    <Button variant="outline" size="sm" onClick={() => cancel(guest.id)}>
                      Cancel
                    </Button>
                  ) : null}
                </Card>
              </li>
            ))}
        </ul>
      )}
    </>
  );
}
