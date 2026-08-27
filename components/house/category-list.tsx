"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatMoney, paiseToRupeeString } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import type { ExpenseCategoryRow } from "@/lib/types/database";

/**
 * Categories and their budgets.
 *
 * Every house buys something the defaults never anticipated — a temple fund, a
 * dog, a shared car. Rather than let that spending pile into "Other" and become
 * invisible, the house can name it, budget it, and see it on the running-cost
 * screen the next day.
 */
export function CategoryList({
  categories,
  spentByCategory,
  currency,
  isAdmin,
}: {
  categories: ExpenseCategoryRow[];
  /** Month-to-date spend, so a budget can be shown against something real. */
  spentByCategory: Record<string, number>;
  currency: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<ExpenseCategoryRow | null>(null);
  const [adding, setAdding] = useState(false);

  const active = categories.filter((category) => category.active);
  const archived = categories.filter((category) => !category.active);

  async function save(
    body: Record<string, unknown>,
    categoryId?: string,
  ): Promise<boolean> {
    const response = await fetch(
      categoryId ? `/api/categories/${categoryId}` : "/api/categories",
      {
        method: categoryId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      toast(payload?.error?.message ?? "That did not work", "danger");
      return false;
    }

    setEditing(null);
    setAdding(false);
    startTransition(() => router.refresh());
    return true;
  }

  return (
    <>
      {isAdmin ? (
        <Button className="mb-3" block onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden />
          Add a category
        </Button>
      ) : null}

      {active.length === 0 ? (
        <EmptyState
          title="No categories yet"
          body="Categories are what turn a list of amounts into an answer about where the money goes."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((category) => (
            <li key={category.id}>
              <Row
                category={category}
                spentPaise={spentByCategory[category.id] ?? 0}
                currency={currency}
                onEdit={isAdmin ? () => setEditing(category) : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <section className="mt-6">
          <h2 className="heading-text mb-2">Archived</h2>
          <CardDescription className="mb-2">
            Hidden when logging an expense. Past expenses keep their category, so
            nothing in the ledger changes.
          </CardDescription>
          <ul className="flex flex-col gap-2">
            {archived.map((category) => (
              <li key={category.id}>
                <Row
                  category={category}
                  spentPaise={spentByCategory[category.id] ?? 0}
                  currency={currency}
                  onEdit={isAdmin ? () => setEditing(category) : undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {adding ? (
        <CategorySheet
          title="Add a category"
          onClose={() => setAdding(false)}
          onSave={(body) => save(body)}
        />
      ) : null}

      {editing ? (
        <CategorySheet
          title={`Edit ${editing.name}`}
          category={editing}
          onClose={() => setEditing(null)}
          onSave={(body) => save(body, editing.id)}
        />
      ) : null}
    </>
  );
}

function Row({
  category,
  spentPaise,
  currency,
  onEdit,
}: {
  category: ExpenseCategoryRow;
  spentPaise: number;
  currency: string;
  onEdit?: () => void;
}) {
  const budget = category.monthly_budget_paise;
  const over = budget !== null && spentPaise > budget;
  const fraction = budget && budget > 0 ? Math.min(1, spentPaise / budget) : 0;

  const body = (
    <Card className={cn(onEdit && "transition-colors hover:border-primary")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium">
          {category.icon ? <span aria-hidden>{category.icon} </span> : null}
          {category.name}
        </span>
        <span className="shrink-0 tabular-nums">
          {formatMoney(spentPaise, { currency })}
        </span>
      </div>

      {budget !== null ? (
        <>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={budget}
            aria-valuenow={spentPaise}
            aria-label={`${category.name} budget`}
          >
            <div
              className={cn("h-full rounded-full", over ? "bg-danger" : "bg-primary")}
              style={{ width: `${Math.round(fraction * 100)}%` }}
            />
          </div>
          <p className="caption-text mt-1 text-text-muted">
            {over ? (
              <>
                <Badge tone="danger">Over</Badge>{" "}
                {formatMoney(spentPaise - budget, { currency })} past the{" "}
                {formatMoney(budget, { currency })} budget
              </>
            ) : (
              <>
                {formatMoney(budget - spentPaise, { currency })} left of{" "}
                {formatMoney(budget, { currency })} this month
              </>
            )}
          </p>
        </>
      ) : (
        <p className="caption-text mt-1 text-text-muted">No monthly budget set</p>
      )}
    </Card>
  );

  if (!onEdit) return body;
  return (
    <button type="button" onClick={onEdit} className="block w-full text-left">
      {body}
    </button>
  );
}

function CategorySheet({
  title,
  category,
  onClose,
  onSave,
}: {
  title: string;
  category?: ExpenseCategoryRow;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "");
  const [budget, setBudget] = useState(
    category?.monthly_budget_paise ? paiseToRupeeString(category.monthly_budget_paise) : "",
  );
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const ok = await onSave({
      name: name.trim(),
      icon: icon.trim(),
      // An empty field clears the budget rather than leaving the old one, which
      // is what "I deleted the number" plainly means.
      monthly_budget: budget.trim(),
    });
    if (!ok) setSaving(false);
  }

  return (
    <BottomSheet open title={title} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="category-name">
          <Input
            id="category-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Temple fund"
            autoFocus
          />
        </Field>

        <Field label="Icon" htmlFor="category-icon" hint="one emoji, optional">
          <Input
            id="category-icon"
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            placeholder="🪔"
            maxLength={4}
            className="w-20 text-center text-xl"
          />
        </Field>

        <Field
          label="Monthly budget"
          htmlFor="category-budget"
          hint="optional — leave blank for no limit"
        >
          <Input
            id="category-budget"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            inputMode="decimal"
            placeholder="5000"
          />
        </Field>

        {category ? (
          <label className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              defaultChecked={!category.active}
              onChange={(event) =>
                onSave({ active: !event.target.checked, name: name.trim() })
              }
              className="size-4"
            />
            <span className="caption-text">
              Archive it — hidden when logging, past expenses untouched
            </span>
          </label>
        ) : null}

        <Button type="submit" block loading={saving} disabled={name.trim().length === 0}>
          Save
        </Button>
      </form>
    </BottomSheet>
  );
}
