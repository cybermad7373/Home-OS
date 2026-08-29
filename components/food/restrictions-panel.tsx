"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import type { RestrictionView } from "@/lib/data/food";

const SEVERITY_LABEL: Record<string, string> = {
  allergy: "Allergy",
  intolerance: "Intolerance",
  diet: "Diet",
};

/**
 * Restrictions — docs/15-FOOD-SPEC.md section 5.2a. A hard exclusion, not a
 * preference: reversible any time, by the person or their guardian. RLS
 * (owns_member_record) is the actual boundary; this only shows what the
 * caller is already allowed to see.
 */
export function RestrictionsPanel({
  restrictions,
  memberId,
}: {
  restrictions: RestrictionView[];
  memberId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [itemName, setItemName] = useState("");
  const [severity, setSeverity] = useState<"allergy" | "intolerance" | "diet">("diet");
  const [saving, setSaving] = useState(false);

  async function onAdd() {
    if (!itemName.trim()) return;
    setSaving(true);
    const response = await fetch("/api/food/restrictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, itemName, severity }),
    });
    setSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast(body?.error?.message ?? "That did not save", "danger");
      return;
    }
    setItemName("");
    toast("Restriction added.", "success");
    router.refresh();
  }

  async function onRemove(id: string) {
    const response = await fetch(`/api/food/restrictions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast(body?.error?.message ?? "That did not remove", "danger");
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardTitle>Restrictions</CardTitle>
      <p className="caption-text mb-3 text-text-muted">
        Allergy, intolerance or diet — a hard exclusion no suggestion ever outranks. Private to you.
      </p>

      {restrictions.length === 0 ? (
        <EmptyState title="None set" body="Add what you cannot eat, and it is excluded everywhere from now on." />
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {restrictions.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-[10px] bg-surface-2 px-3 py-2">
              <span className="text-[14px] text-text">
                {r.itemName} <span className="text-text-subtle">· {SEVERITY_LABEL[r.severity]}</span>
              </span>
              <button
                type="button"
                onClick={() => onRemove(r.id)}
                className="caption-text text-danger"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Field label="Item" htmlFor="restriction-item">
          <Input
            id="restriction-item"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="e.g. Peanut"
          />
        </Field>
        <Field label="Severity" htmlFor="restriction-severity">
          <Select
            id="restriction-severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as typeof severity)}
          >
            <option value="allergy">Allergy</option>
            <option value="intolerance">Intolerance</option>
            <option value="diet">Diet</option>
          </Select>
        </Field>
      </div>
      <Button block onClick={onAdd} loading={saving}>
        Add restriction
      </Button>
    </Card>
  );
}
