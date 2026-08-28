"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  deadlinePhrase,
  responsesPhrase,
  type ProposalAsk,
} from "@/lib/domain/governance/preview";
import type { AbsenceImpact } from "@/lib/domain/absence";
import { formatDate } from "@/lib/utils/date";

/**
 * S-08, rewritten for AV-05 — asking the Home for time away.
 *
 * The old screen declared. This one asks, and the difference is the whole
 * point of the slice: an away day takes work off one person and puts it on
 * somebody else, and lowers a target that money is calculated from at month
 * end. So it goes to the people the Home's policy names, and until one of them
 * answers, nothing about the schedule moves.
 *
 * Two things are on screen before Submit is reachable, both of them required
 * by the specification and neither of them guessable from the form:
 *
 *   * exactly which chores and how many points would move (AV-08);
 *   * who is being asked and how long they have (S-37).
 *
 * Both come from the server, from the same code the request itself runs, so
 * this screen cannot promise something the proposal will not do.
 */

export type AbsenceStatus =
  | "waiting"
  | "approved"
  | "rejected"
  | "cancelled"
  | "lapsed";

export interface AbsenceItem {
  id: string;
  memberId: string;
  memberName: string;
  fromDate: string;
  toDate: string;
  reason: string | null;
  status: AbsenceStatus;
  decidedAt: string | null;
  createdAt: string;
  decisionId: string | null;
}

interface Preview {
  impact: AbsenceImpact;
  summary: string;
  ask: ProposalAsk & { participants: { memberId: string; displayName: string }[] };
}

const STATUS_LABEL: Record<AbsenceStatus, string> = {
  waiting: "Waiting on the house",
  approved: "Approved",
  rejected: "Refused",
  cancelled: "Withdrawn",
  lapsed: "Nobody answered",
};

const STATUS_TONE: Record<
  AbsenceStatus,
  "neutral" | "success" | "warning" | "danger"
> = {
  waiting: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
  lapsed: "neutral",
};

function rangeLabel(item: AbsenceItem, timezone: string): string {
  return item.fromDate === item.toDate
    ? formatDate(item.fromDate, timezone)
    : `${formatDate(item.fromDate, timezone)} – ${formatDate(item.toDate, timezone)}`;
}

export function AbsenceRequests({
  initial,
  myMemberId,
  today,
  timezone,
}: {
  initial: AbsenceItem[];
  myMemberId: string;
  today: string;
  timezone: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [items, setItems] = useState(initial);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // The last request wins. A person dragging a date picker fires one of these
  // per keystroke, and an earlier answer landing after a later one would show
  // the impact of a range they are no longer looking at.
  const previewToken = useRef(0);

  const rangeValid = toDate >= fromDate && fromDate >= today;

  useEffect(() => {
    // Bumped first, so a reply about a range the person has already left is
    // discarded whether or not this run goes on to ask anything.
    const token = ++previewToken.current;

    // Nothing is cleared here on purpose. An invalid range renders the warning
    // instead of the panel, so there is no stale preview on screen to erase —
    // and clearing state in an effect body cascades renders for no gain.
    if (!rangeValid) return;

    // The spinner is raised when the request is actually made, not when the
    // keystroke lands: 250 milliseconds of debounce is below the threshold
    // where a person reads a skeleton as progress, and setting state in the
    // effect body cascades a render for every character typed.
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const response = await fetch("/api/absences/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from_date: fromDate, to_date: toDate }),
        });
        const body = await response.json();
        if (token !== previewToken.current) return;
        setPreview(response.ok ? body : null);
      } catch {
        if (token === previewToken.current) setPreview(null);
      } finally {
        if (token === previewToken.current) setPreviewing(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [fromDate, toDate, rangeValid]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const response = await fetch("/api/absences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_date: fromDate,
        to_date: toDate,
        reason: reason.trim() || undefined,
      }),
    });

    const body = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(body?.error?.message ?? "Something went wrong");
      return;
    }

    // A lead in a Home with nobody else to ask is approved on the spot, and is
    // told so plainly rather than being shown a queue of one that is already
    // finished.
    if (body.applied) {
      const moved = body.redistribution?.reassigned ?? 0;
      toast(
        moved > 0
          ? `Recorded. ${moved} chore${moved === 1 ? "" : "s"} moved to somebody else.`
          : "Recorded — there was nobody else to ask.",
        "success",
      );
    } else {
      toast("Asked. Nothing changes until somebody answers.", "success");
    }

    setItems((current) => [body.absence, ...current]);
    setReason("");
    router.refresh();
  }

  async function withdraw(id: string) {
    const response = await fetch(`/api/absences/${id}`, { method: "DELETE" });
    const body = await response.json();

    if (!response.ok) {
      toast(body?.error?.message ?? "Could not withdraw that", "danger");
      return;
    }

    setItems((current) =>
      current.map((item) => (item.id === id ? body.absence : item)),
    );
    toast("Withdrawn.", "success");
    router.refresh();
  }

  const mine = items.filter((item) => item.memberId === myMemberId);
  const others = items.filter((item) => item.memberId !== myMemberId);

  return (
    <>
      <Card className="mb-4">
        <form onSubmit={submit} noValidate>
          <h2 className="mb-3 font-medium">Ask for time away</h2>

          {error ? (
            <div className="mb-3">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}

          <div className="flex gap-2">
            <div className="flex-1">
              <Field label="First day" htmlFor="absence-from">
                <Input
                  id="absence-from"
                  type="date"
                  value={fromDate}
                  min={today}
                  onChange={(event) => {
                    setFromDate(event.target.value);
                    if (toDate < event.target.value) setToDate(event.target.value);
                  }}
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Last day" htmlFor="absence-to">
                <Input
                  id="absence-to"
                  type="date"
                  value={toDate}
                  min={fromDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </Field>
            </div>
          </div>

          <Field label="Why" htmlFor="absence-reason" hint="optional">
            <Input
              id="absence-reason"
              value={reason}
              maxLength={200}
              placeholder="Home for the weekend"
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>

          <ImpactPanel loading={previewing} preview={preview} valid={rangeValid} />

          <Button type="submit" disabled={saving || !rangeValid} className="w-full">
            {saving ? "Asking…" : "Ask the house"}
          </Button>
        </form>
      </Card>

      <section className="mb-4">
        <h2 className="mb-2 font-medium">Yours</h2>
        {mine.length === 0 ? (
          <EmptyState
            title="Nothing asked for"
            body="Ask before you go, not after. An absence nobody approved is a missed chore."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {mine.map((item) => (
              <li key={item.id}>
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{rangeLabel(item, timezone)}</p>
                    <p className="caption-text text-text-muted">
                      {item.reason ?? "No reason given"}
                    </p>
                    <Badge tone={STATUS_TONE[item.status]} className="mt-1.5">
                      {STATUS_LABEL[item.status]}
                    </Badge>
                  </div>
                  {item.status === "waiting" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => withdraw(item.id)}
                    >
                      Withdraw
                    </Button>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 ? (
        <section className="mb-4">
          <h2 className="mb-2 font-medium">The rest of the house</h2>
          <ul className="flex flex-col gap-2">
            {others.map((item) => (
              <li key={item.id}>
                <Card>
                  <p className="font-medium">
                    {item.memberName} · {rangeLabel(item, timezone)}
                  </p>
                  <p className="caption-text text-text-muted">
                    {item.reason ?? "No reason given"}
                  </p>
                  <Badge tone={STATUS_TONE[item.status]} className="mt-1.5">
                    {STATUS_LABEL[item.status]}
                  </Badge>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/**
 * AV-08 and S-37 in one panel: what it costs you, and who it costs to ask.
 *
 * The empty case is stated rather than left blank. "Nothing is assigned to you
 * on those days yet" is the most common answer and the most reassuring one,
 * and a blank space says it far less clearly than a sentence does.
 */
function ImpactPanel({
  loading,
  preview,
  valid,
}: {
  loading: boolean;
  preview: Preview | null;
  valid: boolean;
}) {
  if (!valid) {
    return (
      <div className="mb-4">
        <Alert tone="warning">Pick a first day today or later, and a last day after it.</Alert>
      </div>
    );
  }

  if (loading && !preview) {
    return (
      <div className="mb-4 flex flex-col gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  if (!preview) return null;

  const { impact, ask } = preview;
  const responses = responsesPhrase(ask);
  const deadline = deadlinePhrase(ask.deadlineHours);

  return (
    <div className="mb-4 rounded-[10px] border border-border bg-surface-2 p-3">
      <p className="text-[15px]">{preview.summary}</p>

      {impact.moving.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {impact.moving.map((chore) => (
            <li
              key={chore.assignmentId}
              className="caption-text flex justify-between gap-2 text-text-muted"
            >
              <span className="truncate">
                {chore.date} · {chore.name}
              </span>
              <span>{chore.effortPoints} pts</span>
            </li>
          ))}
        </ul>
      ) : null}

      {impact.guestChores.length > 0 ? (
        <p className="caption-text mt-2 text-warning">
          {impact.guestChores.length} guest chore
          {impact.guestChores.length === 1 ? "" : "s"} stays with you — only the
          host may do a guest&rsquo;s work. Cancel the guest to remove it.
        </p>
      ) : null}

      <p className="caption-text mt-3 text-text-muted">
        {ask.autoApprove
          ? "There is nobody else here to ask, so this takes effect as soon as you ask for it. It is recorded either way."
          : `${
              ask.participants.length === 1
                ? ask.participants[0].displayName
                : `${ask.participants.length} people`
            } will be asked${responses ? ` — ${responses}` : ""}${
              deadline ? `, within ${deadline}` : ""
            }. Nothing changes until they respond.`}
      </p>
    </div>
  );
}

/**
 * The two exception kinds that are still a declaration.
 *
 * Being home all day, or home at different hours, costs the Home nothing: it
 * adds capacity or moves it, and nobody else's week changes. Routing those
 * through an approval queue would teach people that the queue is noise, which
 * is the failure mode the roadmap names for this whole phase.
 */
export function DayAdjustment({
  today,
  onSaved,
}: {
  today: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [type, setType] = useState<"home_all_day" | "custom_hours">("home_all_day");
  const [leavesAt, setLeavesAt] = useState("");
  const [returnsAt, setReturnsAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const response = await fetch("/api/availability/exceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exc_date: date,
        exc_type: type,
        leaves_at: type === "custom_hours" ? leavesAt || null : null,
        returns_at: type === "custom_hours" ? returnsAt || null : null,
      }),
    });

    const body = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(body?.error?.message ?? "Something went wrong");
      return;
    }

    toast("Saved.", "success");
    onSaved?.();
    router.refresh();
  }

  return (
    <Card className="mb-4">
      <form onSubmit={submit} noValidate>
        <h2 className="mb-3 font-medium">Change your hours for a day</h2>

        {error ? (
          <div className="mb-3">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        <div className="flex gap-2">
          <div className="flex-1">
            <Field label="Day" htmlFor="adjust-date">
              <Input
                id="adjust-date"
                type="date"
                value={date}
                min={today}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="What" htmlFor="adjust-type">
              <Select
                id="adjust-type"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as "home_all_day" | "custom_hours")
                }
              >
                <option value="home_all_day">Home all day</option>
                <option value="custom_hours">Different hours</option>
              </Select>
            </Field>
          </div>
        </div>

        {type === "custom_hours" ? (
          <div className="flex gap-2">
            <div className="flex-1">
              <Field label="Out at" htmlFor="adjust-out">
                <Input
                  id="adjust-out"
                  type="time"
                  value={leavesAt}
                  onChange={(event) => setLeavesAt(event.target.value)}
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Back at" htmlFor="adjust-back">
                <Input
                  id="adjust-back"
                  type="time"
                  value={returnsAt}
                  onChange={(event) => setReturnsAt(event.target.value)}
                />
              </Field>
            </div>
          </div>
        ) : null}

        <Button type="submit" disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save"}
        </Button>

        <p className="caption-text mt-3 text-text-muted">
          These take effect straight away. Being home more, or at different
          hours, costs nobody else anything — going away does, which is why that
          is a request.
        </p>
      </form>
    </Card>
  );
}
