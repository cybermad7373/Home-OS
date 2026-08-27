"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { JoinRequestView } from "@/lib/data/homes";

/**
 * The queue a lead answers.
 *
 * Only a lead ever renders this. An ordinary member sees the count and a muted
 * "Requested" entry in the member list, and none of the detail here (HM-07).
 */
export function JoinRequests({ requests }: { requests: JoinRequestView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<JoinRequestView | null>(null);
  const [, startTransition] = useTransition();

  if (requests.length === 0) return null;

  async function accept(request: JoinRequestView) {
    setBusyId(request.id);
    const response = await fetch(`/api/join-requests/${request.id}/accept`, {
      method: "POST",
    });
    const body = await response.json().catch(() => ({}));
    setBusyId(null);

    if (!response.ok) {
      toast(body?.error?.message ?? "That did not work", "danger");
      return;
    }
    toast(`${request.displayName} is in.`, "success");
    startTransition(() => router.refresh());
  }

  return (
    <section className="mb-4">
      <h2 className="heading-text mb-2">
        Waiting to be let in ({requests.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {requests.map((request) => (
          <li key={request.id}>
            <Card>
              <CardTitle>{request.displayName}</CardTitle>
              <CardDescription>
                {request.message ?? "They did not say anything about themselves."}
              </CardDescription>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  loading={busyId === request.id}
                  onClick={() => accept(request)}
                >
                  Let them in
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDeclining(request)}
                >
                  Decline
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {declining ? (
        <DeclineSheet
          request={declining}
          onClose={() => setDeclining(null)}
          onDone={() => {
            setDeclining(null);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * Declining takes a reason, and the reason is kept. Ten characters is the same
 * floor governance puts on a rejection: long enough that "no" has to become a
 * sentence somebody could answer.
 */
function DeclineSheet({
  request,
  onClose,
  onDone,
}: {
  request: JoinRequestView;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const response = await fetch(`/api/join-requests/${request.id}/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const body = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      toast(body?.error?.message ?? "That did not work", "danger");
      return;
    }
    toast("Declined. They can ask again.", "success");
    onDone();
  }

  return (
    <BottomSheet open onClose={onClose} title={`Decline ${request.displayName}`}>
      <Field
        label="Why?"
        htmlFor="reason"
        hint="they will see this, and it stays on the record"
      >
        <Input
          id="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={280}
          placeholder="We are full until March"
        />
      </Field>
      <Button block loading={loading} disabled={reason.trim().length < 10} onClick={submit}>
        Decline
      </Button>
    </BottomSheet>
  );
}
