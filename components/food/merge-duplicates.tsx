"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { FoodView } from "@/lib/data/food";

/**
 * Merge duplicates — docs/15-FOOD-SPEC.md section 4.1, Admin/Co-Admin only.
 * The source entry's history moves onto the target; nothing merges without
 * this confirmation (FD-10). `merge_food_entries` enforces the lead check
 * itself, so this is a UX gate, not the enforcement.
 */
export function MergeDuplicates({ foods }: { foods: FoodView[] }) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [merging, setMerging] = useState(false);

  if (foods.length < 2) return null;

  async function merge() {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setMerging(true);
    const response = await fetch("/api/food/library/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, targetId }),
    });
    const body = await response.json().catch(() => ({}));
    setMerging(false);

    if (!response.ok) {
      toast(body?.error?.message ?? "That did not save", "danger");
      return;
    }

    toast("Merged. Both names stay in History.", "success");
    setOpen(false);
    setSourceId("");
    setTargetId("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="caption-text mb-3 flex items-center gap-1.5 text-primary"
      >
        <Merge size={14} aria-hidden /> Merge duplicates
      </button>
    );
  }

  return (
    <div className="mb-4 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Merge this" htmlFor="merge-source">
          <Select id="merge-source" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">Choose an entry</option>
            {foods.map((f) => (
              <option key={f.id} value={f.id} disabled={f.id === targetId}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Into this" htmlFor="merge-target">
          <Select id="merge-target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Choose an entry</option>
            {foods.map((f) => (
              <option key={f.id} value={f.id} disabled={f.id === sourceId}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          onClick={merge}
          loading={merging}
          disabled={!sourceId || !targetId || sourceId === targetId}
        >
          Merge
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
