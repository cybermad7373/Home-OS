"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils/money";
import type { ShoppingItemView } from "@/lib/data/food";

/**
 * Shopping List client (S-53) — docs/15-FOOD-SPEC.md section 13. Any member
 * checks off any item (it is shared); only the item's creator or a lead
 * removes one, mirroring migration 085's RLS.
 */
export function ShoppingListClient({
  initialItems,
  currency,
  myMemberId,
  isLead,
}: {
  initialItems: ShoppingItemView[];
  currency: string;
  myMemberId: string;
  isLead: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [items, setItems] = useState(initialItems);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = items.filter((i) => !i.checkedOff);
  const checked = items.filter((i) => i.checkedOff);

  async function addItem() {
    if (!name.trim()) return;
    setAdding(true);
    const response = await fetch("/api/food/shopping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setAdding(false);
    if (!response.ok) {
      toast("That did not save", "danger");
      return;
    }
    setName("");
    router.refresh();
  }

  async function toggle(item: ShoppingItemView) {
    setBusyId(item.id);
    const next = !item.checkedOff;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checkedOff: next } : i)));
    const response = await fetch(`/api/food/shopping/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkedOff: next }),
    });
    setBusyId(null);
    if (!response.ok) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checkedOff: !next } : i)));
      toast("That did not save", "danger");
    }
  }

  async function remove(item: ShoppingItemView) {
    setBusyId(item.id);
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const response = await fetch(`/api/food/shopping/${item.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!response.ok) {
      setItems(previous);
      toast("That did not save", "danger");
    }
  }

  async function generate() {
    setGenerating(true);
    const response = await fetch("/api/food/shopping/generate", { method: "POST" });
    setGenerating(false);
    if (!response.ok) {
      toast("That did not save", "danger");
      return;
    }
    const body = (await response.json()) as { added: number };
    toast(
      body.added > 0
        ? `Added ${body.added} item${body.added === 1 ? "" : "s"} from upcoming meals.`
        : "Nothing new — every ingredient is already on the list.",
      "success",
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add an item"
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />
        <Button onClick={addItem} loading={adding} aria-label="Add item">
          <Plus size={16} aria-hidden />
        </Button>
      </div>

      <Button variant="secondary" onClick={generate} loading={generating} className="self-start">
        <RefreshCw size={16} aria-hidden /> Generate from meals
      </Button>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing on the list yet"
          body="Add an item, or generate one from the next 7 days of planned meals."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {pending.map((item) => (
            <ShoppingRow
              key={item.id}
              item={item}
              currency={currency}
              canDelete={isLead || item.createdBy === myMemberId}
              busy={busyId === item.id}
              onToggle={() => toggle(item)}
              onDelete={() => remove(item)}
            />
          ))}
        </ul>
      )}

      {checked.length > 0 ? (
        <div>
          <h2 className="caption-text mb-2 text-text-muted">This week</h2>
          <ul className="flex flex-col gap-2">
            {checked.map((item) => (
              <ShoppingRow
                key={item.id}
                item={item}
                currency={currency}
                canDelete={isLead || item.createdBy === myMemberId}
                busy={busyId === item.id}
                onToggle={() => toggle(item)}
                onDelete={() => remove(item)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ShoppingRow({
  item,
  currency,
  canDelete,
  busy,
  onToggle,
  onDelete,
}: {
  item: ShoppingItemView;
  currency: string;
  canDelete: boolean;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3">
      <input
        type="checkbox"
        checked={item.checkedOff}
        disabled={busy}
        onChange={onToggle}
        className="touch-target h-5 w-5"
        aria-label={`Check off ${item.name}`}
      />
      <div className="flex-1">
        <p className={item.checkedOff ? "text-[15px] text-text-muted line-through" : "text-[15px] text-text"}>
          {item.name}
          {item.quantity ? ` · ${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : ""}
        </p>
      </div>
      {item.estimatedPricePaise !== null ? (
        <span className="caption-text text-text-muted">
          {formatMoney(item.estimatedPricePaise, { currency })}
        </span>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Remove ${item.name}`}
          className="touch-target text-text-subtle hover:text-danger"
        >
          <Trash2 size={16} aria-hidden />
        </button>
      ) : null}
    </li>
  );
}
