"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * S-04 — the waiting screen. It polls rather than subscribes: being let in is a
 * once-per-person event and a 15-second poll is cheaper than a realtime channel
 * held open across the whole Home.
 *
 * **Changed in phase 10.** It used to poll `house_members` for the caller's own
 * row, which no longer exists while they are waiting: a person with an open
 * request has a `join_requests` row and no membership at all until a lead
 * accepts. So the poll asks `GET /api/homes`, which is the one place that knows
 * about both, and it watches for an Active membership appearing rather than for
 * a status column changing.
 */
export function PendingApproval({
  houseName,
  memberId,
}: {
  houseName: string;
  /** Null while the caller is waiting on a request and has no membership yet. */
  memberId: string | null;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/homes", { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json();
      const homes: { status: string }[] = body?.homes ?? [];
      if (homes.some((home) => home.status === "active")) {
        router.replace("/onboarding/profile");
        router.refresh();
      }
    } finally {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [check, memberId]);

  return (
    <Card>
      <h1 className="title-text mb-2">Waiting to be let in</h1>
      <p className="text-text-muted">
        You have asked to join <span className="font-medium text-text">{houseName}</span>.
        Somebody who runs it has to let you in — holding the link is not enough on
        its own.
      </p>
      <p className="caption-text mt-2 text-text-muted">
        Until then you can see nothing of that home: not its members, not its
        money, not its chores.
      </p>

      <div className="my-6 flex items-center gap-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
        <span className="caption-text text-text-muted">
          {checking ? "Checking…" : "Checking every 15 seconds"}
        </span>
      </div>

      <Button variant="outline" block onClick={check} loading={checking}>
        Check now
      </Button>
    </Card>
  );
}
