"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemberAvatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { canConfirm } from "@/lib/domain/governance/quorum";
import { cn } from "@/lib/utils/cn";
import { relativeTime } from "@/lib/utils/date";
import { compressImage } from "@/lib/utils/image";
import { createClient } from "@/lib/infra/supabase/client";
import { LastDoneLine } from "@/components/chores/last-done-line";

export interface ChoreItem {
  id: string;
  name: string;
  category: string;
  choreDate: string;
  slot: string;
  effortPoints: number;
  durationMin: number;
  status:
    | "assigned"
    | "open"
    | "done_pending"
    | "confirmed"
    | "rejected"
    | "missed"
    | "cancelled";
  deadline: string;
  doneAt: string | null;
  photoUrl: string | null;
  note: string | null;
  autoConfirmed: boolean;
  rejectedReason: string | null;
  retryCount: number;
  /** CH-12 — the template's own last-completed figure, not this instance's. */
  lastDoneAt: string | null;
  lastDoneByName: string | null;
  assignee: {
    memberId: string;
    displayName: string;
    avatarUrl: string | null;
    kind: "adult" | "dependent";
    guardianMemberId: string | null;
  } | null;
  confirmedBy: { memberId: string; displayName: string } | null;
  /** The quorum snapshotted at "done", and who has signed — migration 054. */
  quorum: {
    required: number;
    received: number;
    leadRequired: boolean;
    confirmations: { memberId: string; displayName: string; isLead: boolean; at: string }[];
  };
}

/**
 * How the quorum reads to somebody looking at a chore waiting on it.
 *
 * A count on its own ("1 of 2") does not say what the missing signature has to
 * be, and an Admin's is not interchangeable with anybody else's above four
 * adults. Both halves are stated.
 */
function quorumSentence(chore: ChoreItem): string | null {
  if (chore.status !== "done_pending" || chore.quorum.required <= 1) return null;
  const outstanding = Math.max(chore.quorum.required - chore.quorum.received, 0);
  const leadMissing =
    chore.quorum.leadRequired && !chore.quorum.confirmations.some((entry) => entry.isLead);
  const count = `${chore.quorum.received} of ${chore.quorum.required} confirmations`;
  if (leadMissing) {
    return outstanding <= 1
      ? `${count} · an Admin or Co-Admin still has to sign`
      : `${count} · one has to be an Admin or Co-Admin`;
  }
  return count;
}

/** The coloured left rail, by category — docs/08-UI-UX-SPEC.md section 2.1. */
const CATEGORY_COLOUR: Record<string, string> = {
  cooking: "var(--cat-cooking)",
  kitchen_cleaning: "var(--cat-kitchen)",
  bathroom_cleaning: "var(--cat-bathroom)",
  room_cleaning: "var(--cat-room)",
  common_cleaning: "var(--cat-common)",
  mopping: "var(--cat-mopping)",
  other: "var(--cat-other)",
};

const STATUS_LABEL: Record<ChoreItem["status"], { text: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  assigned: { text: "To do", tone: "neutral" },
  open: { text: "Nobody assigned", tone: "warning" },
  done_pending: { text: "Waiting to be confirmed", tone: "warning" },
  confirmed: { text: "Confirmed", tone: "success" },
  rejected: { text: "Rejected — one retry left", tone: "danger" },
  missed: { text: "Missed", tone: "danger" },
  cancelled: { text: "Cancelled", tone: "neutral" },
};

/**
 * One chore, with whatever action the caller can actually take on it.
 *
 * Status is never conveyed by colour alone — every chip carries its text, per
 * the accessibility rules.
 */
export function ChoreCard({
  chore,
  myMemberId,
  houseId,
  variant = "full",
  guardianFor,
}: {
  chore: ChoreItem;
  myMemberId: string;
  /** For the storage path when a photo is attached after the fact (S-12). */
  houseId: string;
  variant?: "compact" | "full";
  /**
   * The dependent whose work the caller is responsible for, when this card is
   * rendered on their behalf. A dependent has no login, so their guardian marks
   * the chore done — which is what happens in the room anyway (migration 039).
   * The guardian still may not confirm it: the database refuses that, and so
   * does this card.
   */
  guardianFor?: { memberId: string; displayName: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [note, setNote] = useState(chore.note ?? "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [reason, setReason] = useState("");

  const isMine = chore.assignee?.memberId === myMemberId;
  const isMyDependents =
    guardianFor !== undefined && chore.assignee?.memberId === guardianFor.memberId;
  const status = STATUS_LABEL[chore.status];

  // The card never offers a button the database will refuse. `canConfirm` is
  // the one statement of who may sign — the same function the confirmation
  // queue filters on, and the rule migration 054's trigger enforces.
  const alreadySigned = chore.quorum.confirmations.some(
    (entry) => entry.memberId === myMemberId,
  );
  const guardsAssignee =
    chore.assignee?.kind === "dependent" &&
    chore.assignee.guardianMemberId === myMemberId;
  const mayRespond = canConfirm(
    {
      status: chore.status,
      assigneeMemberId: chore.assignee?.memberId ?? null,
      assigneeKind: chore.assignee?.kind ?? "adult",
      assigneeGuardianMemberId: chore.assignee?.guardianMemberId ?? null,
      confirmedBy: chore.quorum.confirmations.map((entry) => entry.memberId),
    },
    myMemberId,
  );
  const progress = quorumSentence(chore);

  async function act(
    path: string,
    body: unknown,
    /**
     * A function rather than a string, because "Confirmed" is only true when
     * the signature completed the quorum. The route returns the status the
     * write actually produced, and the message follows it.
     */
    success: string | ((payload: { status?: string }) => string),
  ) {
    setBusy(true);
    const response = await fetch(`/api/chores/${chore.id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      toast(payload?.error?.message ?? "That did not work", "danger");
      return;
    }

    setRejecting(false);
    setReason("");
    toast(typeof success === "string" ? success : success(payload ?? {}), "success");
    router.refresh();
  }

  /**
   * S-12 — the photo and the note are attached after the tap, on their own
   * call, never as part of marking done. Open for as long as the instance is
   * still `assigned` or `done_pending`.
   */
  async function attachDetails(fields: { photo_url?: string; note?: string }) {
    const response = await fetch(`/api/chores/${chore.id}/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast(payload?.error?.message ?? "That did not attach", "danger");
      return;
    }
    toast("Saved.", "success");
    router.refresh();
  }

  async function onPickPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(file);
      const supabase = createClient();
      const path = `${houseId}/${crypto.randomUUID()}.${compressed.extension}`;
      const { error } = await supabase.storage
        .from("chore-photos")
        .upload(path, compressed.blob, {
          contentType: compressed.blob.type || "image/webp",
          upsert: false,
        });
      if (error) throw error;
      await attachDetails({ photo_url: path });
    } catch {
      toast("The photo would not upload.", "danger");
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <div className="flex gap-3 px-4 py-3">
      <span
        aria-hidden
        className="w-1 shrink-0 rounded-full"
        style={{ background: CATEGORY_COLOUR[chore.category] ?? CATEGORY_COLOUR.other }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn("truncate font-medium", chore.status === "missed" && "line-through")}>
            {chore.name}
          </p>
          <span className="tabular shrink-0 text-[13px] font-semibold">
            {chore.effortPoints} pts
          </span>
        </div>

        <p className="caption-text text-text-muted">
          {chore.slot === "any" ? "Any time" : chore.slot === "morning" ? "Morning" : "Evening"}
          {" · "}
          {chore.durationMin} min
          {chore.assignee && !isMine ? ` · ${chore.assignee.displayName}` : ""}
          {isMine ? " · you" : ""}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.text}</Badge>
          {chore.autoConfirmed ? <Badge tone="info">Auto-confirmed</Badge> : null}
          {chore.doneAt ? (
            <span className="caption-text text-text-subtle">
              done {relativeTime(chore.doneAt)}
            </span>
          ) : null}
        </div>

        {variant === "full" ? (
          <LastDoneLine
            instanceStatus={chore.status}
            lastDoneAt={chore.lastDoneAt}
            lastDoneByName={chore.lastDoneByName}
          />
        ) : null}

        {progress ? (
          <p className="caption-text mt-1 text-text-muted">{progress}</p>
        ) : null}

        {chore.rejectedReason ? (
          <p className="caption-text mt-1 text-danger">
            Rejected: {chore.rejectedReason}
          </p>
        ) : null}

        {variant === "full" ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {isMyDependents && (chore.status === "assigned" || chore.status === "rejected") ? (
              <Button
                size="sm"
                loading={busy}
                onClick={() =>
                  act(
                    "done",
                    {},
                    `Marked done for ${guardianFor.displayName}. Somebody else confirms it.`,
                  )
                }
              >
                {guardianFor.displayName} did it ✓
              </Button>
            ) : null}

            {isMine && (chore.status === "assigned" || chore.status === "rejected") ? (
              <>
                <Button
                  size="sm"
                  loading={busy}
                  onClick={() =>
                    act("done", {}, "Marked done. It auto-confirms if nobody responds.")
                  }
                >
                  Done ✓
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy}
                  onClick={() => act("release", {}, "Released to the pool.")}
                >
                  Cannot do it
                </Button>
              </>
            ) : null}

            {chore.status === "open" ? (
              <Button
                size="sm"
                loading={busy}
                onClick={() => act("claim", {}, "It is yours.")}
              >
                Claim it
              </Button>
            ) : null}

            {/* Nobody confirms their own work — the payer of the effort never
                sees these buttons on their own row — and above three adults
                one signature is no longer the whole quorum. */}
            {mayRespond ? (
              rejecting ? (
                <div className="w-full rounded-[10px] bg-surface-2 p-3">
                  <Input
                    aria-label="What was wrong with it"
                    value={reason}
                    placeholder="What was wrong with it?"
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busy}
                      disabled={reason.trim().length < 3}
                      onClick={() => act("reject", { reason }, "Rejected.")}
                    >
                      Reject it
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRejecting(true)}
                    aria-label={`Reject ${chore.name}`}
                  >
                    ✕
                  </Button>
                  <Button
                    size="sm"
                    loading={busy}
                    onClick={() =>
                      act("confirm", {}, (payload) =>
                        payload.status === "confirmed"
                          ? `Confirmed — ${chore.effortPoints} points to ${chore.assignee?.displayName ?? "them"}.`
                          : "Your confirmation is in. It needs one more before the points post.",
                      )
                    }
                  >
                    Confirm
                  </Button>
                </>
              )
            ) : null}

            {chore.status === "done_pending" && isMine ? (
              <p className="caption-text text-text-muted">
                {chore.quorum.required > 1
                  ? `Waiting on ${chore.quorum.required} people to confirm it.`
                  : "Waiting for somebody else to confirm it."}
              </p>
            ) : null}

            {chore.status === "done_pending" && !isMine && alreadySigned ? (
              <p className="caption-text text-text-muted">
                You confirmed this. It is waiting on somebody else.
              </p>
            ) : null}

            {chore.status === "done_pending" && guardsAssignee ? (
              <p className="caption-text text-text-muted">
                You marked this done for {chore.assignee?.displayName ?? "them"}, so
                somebody else confirms it.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* S-12 — after the fact, never a gate: open for as long as the
            instance has not moved past done_pending. */}
        {variant === "full" &&
        (isMine || isMyDependents) &&
        (chore.status === "assigned" || chore.status === "done_pending") ? (
          attaching ? (
            <div className="mt-2 rounded-[10px] bg-surface-2 p-3">
              <label htmlFor={`note-${chore.id}`} className="sr-only">
                Note
              </label>
              <Input
                id={`note-${chore.id}`}
                value={note}
                placeholder="Add a note (optional)"
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className={cn("touch-target", uploadingPhoto && "opacity-60")}>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploadingPhoto}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void onPickPhoto(file);
                      event.target.value = "";
                    }}
                  />
                  <span className="touch-target rounded-[10px] border border-border px-3 py-1.5 text-[13px]">
                    {uploadingPhoto ? "Uploading…" : chore.photoUrl ? "Replace photo" : "Add photo"}
                  </span>
                </label>
                <Button size="sm" variant="ghost" onClick={() => setAttaching(false)}>
                  Close
                </Button>
                <Button
                  size="sm"
                  disabled={note.trim() === (chore.note ?? "")}
                  onClick={async () => {
                    await attachDetails({ note: note.trim() });
                    setAttaching(false);
                  }}
                >
                  Save note
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="caption-text mt-1 text-primary"
              onClick={() => setAttaching(true)}
            >
              {chore.photoUrl || chore.note ? "Edit photo or note" : "+ Add photo or note"}
            </button>
          )
        ) : null}
      </div>

      {chore.assignee && variant === "compact" ? (
        <MemberAvatar
          name={chore.assignee.displayName}
          avatarUrl={chore.assignee.avatarUrl}
          size="sm"
        />
      ) : null}
    </div>
  );
}
