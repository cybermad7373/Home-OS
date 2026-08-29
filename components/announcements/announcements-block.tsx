"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { BottomSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { AnnouncementView } from "@/lib/data/announcements";

const TONE: Record<AnnouncementView["severity"], string> = {
  info: "border-border",
  important: "border-warning",
  urgent: "border-danger",
};

const MARK: Record<AnnouncementView["severity"], string> = {
  info: "",
  important: "⚠ ",
  urgent: "⚠ ",
};

/**
 * The Announcements block on Today — BR-260, BR-261, S-50.
 *
 * A broadcast from a lead to the Home, with an expiry. Every member reads it;
 * only a lead is offered the control that writes one, because an option that
 * opens and then refuses is worse than an option that was never there
 * (docs/08-UI-UX-SPEC.md section 3.6).
 */
export function AnnouncementsBlock({
  announcements,
  canPost,
  timezone,
}: {
  announcements: AnnouncementView[];
  canPost: boolean;
  timezone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<AnnouncementView["severity"]>("info");
  const [expiresInHours, setExpiresInHours] = useState("24");
  const [saving, setSaving] = useState(false);

  // Nothing posted and nothing the caller could post with: the block is
  // omitted rather than shown empty, like every other block on Today.
  if (announcements.length === 0 && !canPost) return null;

  async function post() {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    const response = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        severity,
        expiresInHours: Number(expiresInHours),
      }),
    });
    setSaving(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      toast(payload?.error?.message ?? "That did not post", "danger");
      return;
    }

    setTitle("");
    setBody("");
    setSeverity("info");
    setExpiresInHours("24");
    setOpen(false);
    toast("Posted to the home.", "success");
    router.refresh();
  }

  async function remove(id: string) {
    const response = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      toast(payload?.error?.message ?? "That did not come down", "danger");
      return;
    }
    router.refresh();
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="heading-text">Announcements</h2>
        {canPost ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="caption-text text-primary"
          >
            + Post one
          </button>
        ) : null}
      </div>

      {announcements.length === 0 ? (
        <p className="caption-text text-text-muted">
          Nothing posted. Anything you post here shows on everybody&apos;s Today until it expires.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {announcements.map((announcement) => (
            <li key={announcement.id}>
              <Card className={`${TONE[announcement.severity]} p-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {MARK[announcement.severity]}
                      {announcement.title}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-[14px] text-text">
                      {announcement.body}
                    </p>
                    <p className="caption-text mt-1 text-text-muted">
                      Posted by {announcement.authorName} · until{" "}
                      {new Date(announcement.expiresAt).toLocaleString("en-IN", {
                        timeZone: timezone,
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {canPost ? (
                    <button
                      type="button"
                      onClick={() => remove(announcement.id)}
                      className="caption-text shrink-0 text-text-muted hover:text-danger"
                    >
                      Take down
                    </button>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Post an announcement">
        <div className="flex flex-col gap-3">
          <Field label="Title" htmlFor="announcement-title">
            <Input
              id="announcement-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              placeholder="Maintenance tomorrow"
            />
          </Field>
          <Field label="What is happening" htmlFor="announcement-body">
            <textarea
              id="announcement-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Water is off from 10 AM to 2 PM."
              className="w-full rounded-[10px] border border-border bg-surface-2 p-3 text-[15px] text-text placeholder:text-text-subtle focus:bg-surface"
            />
          </Field>
          <Field label="How much it matters" htmlFor="announcement-severity">
            <Select
              id="announcement-severity"
              value={severity}
              onChange={(event) =>
                setSeverity(event.target.value as AnnouncementView["severity"])
              }
            >
              <option value="info">Information</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
          {/*
            A duration rather than a date and time. "For the next two days" is
            what a person means, and it takes the timezone out of the form.
          */}
          <Field label="Show it for" htmlFor="announcement-expiry">
            <Select
              id="announcement-expiry"
              value={expiresInHours}
              onChange={(event) => setExpiresInHours(event.target.value)}
            >
              <option value="6">6 hours</option>
              <option value="24">A day</option>
              <option value="72">Three days</option>
              <option value="168">A week</option>
            </Select>
          </Field>
          <Button onClick={post} disabled={saving || !title.trim() || !body.trim()}>
            {saving ? "Posting…" : "Post to the home"}
          </Button>
        </div>
      </BottomSheet>
    </section>
  );
}
