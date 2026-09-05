"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/layout/section";
import { useToast } from "@/components/ui/toast";

/**
 * The live invite link, and the two things anybody does with it.
 *
 * It used to exist in one place: the rail of `/admin/settings`. So the answer
 * to "how do I add somebody to this home" was a screen about penalty rates and
 * approval thresholds, and `/house/members` — the screen actually named after
 * the question — could not do it. This component is that block, lifted out so
 * both screens render the same one.
 *
 * Holding the link grants nothing (SEC-15): it lets somebody *ask*, and a lead
 * still has to let them in. The copy says so, because an invite link that
 * looked like a back door would be handed around like one.
 */
export function InvitePanel({
  inviteUrl,
  label = "Invite link",
  className,
}: {
  inviteUrl: string | null;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [link, setLink] = useState(inviteUrl);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function rotate() {
    setBusy(true);
    const response = await fetch("/api/invitations", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      toast(payload?.error?.message ?? "That did not work", "danger");
      return;
    }

    setLink(payload.invite_url);
    setCopied(false);
    toast("New link. The old one stopped working immediately.", "success");
    startTransition(() => router.refresh());
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Could not copy. Select the link and copy it by hand.", "danger");
    }
  }

  return (
    <Section label={label} className={className}>
      {link ? (
        <p className="break-all rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2 font-mono text-[13px]">
          {link}
        </p>
      ) : (
        <p className="caption-text text-text-muted">
          There is no live link. Nobody new can ask until you make one.
        </p>
      )}
      <p className="caption-text mt-2 text-text-muted">
        Holding the link grants nothing on its own — somebody here still has to
        let them in.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {link ? (
          <Button variant="outline" size="sm" onClick={copyLink}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" loading={busy} onClick={rotate}>
          {link ? "Replace this link" : "Make a link"}
        </Button>
      </div>
    </Section>
  );
}
