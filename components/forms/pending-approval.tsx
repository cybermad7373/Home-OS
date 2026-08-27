"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/infra/supabase/client";

/**
 * S-04 — the waiting screen. It polls rather than subscribes: approval is a
 * once-per-member event and a 15-second poll is cheaper than a realtime channel
 * held open across the whole house.
 */
export function PendingApproval({
  houseName,
  memberId,
}: {
  houseName: string;
  memberId: string;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function check() {
      setChecking(true);
      const { data } = await supabase
        .from("house_members")
        .select("status")
        .eq("id", memberId)
        .maybeSingle();
      setChecking(false);
      if (data?.status === "active") {
        router.replace("/onboarding/profile");
        router.refresh();
      }
    }

    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [memberId, router]);

  return (
    <Card>
      <h1 className="title-text mb-2">Waiting for approval</h1>
      <p className="text-text-muted">
        You have asked to join <span className="font-medium text-text">{houseName}</span>.
        An admin has to let you in — possession of the code is not enough on its own.
      </p>

      <div className="my-6 flex items-center gap-3">
        <span
          className="h-2 w-2 animate-pulse rounded-full bg-primary"
          aria-hidden
        />
        <span className="caption-text text-text-muted">
          {checking ? "Checking…" : "Checking every 15 seconds"}
        </span>
      </div>

      <Button variant="outline" block onClick={() => router.refresh()}>
        Check now
      </Button>
    </Card>
  );
}
