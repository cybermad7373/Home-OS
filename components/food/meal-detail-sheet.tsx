"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { LinkExpenseChip } from "./link-expense-chip";
import { formatMoney, rupeesToPaise, paiseToRupeeString } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";
import type { MealView } from "@/lib/data/food";

const SOURCE_LABEL: Record<string, string> = {
  home_cooked: "Home cooked",
  bought: "Bought",
  ordered: "Ordered",
  other: "Other",
};

const SOURCES = ["home_cooked", "bought", "ordered", "other"] as const;
const TYPES = ["breakfast", "lunch", "dinner", "snack", "other"] as const;

/**
 * S-45 — meal detail.
 *
 * The one screen the food phase shipped without: a meal could be recorded and
 * never opened again, so a mistyped amount or a wrong date was permanent, and
 * the recipe instructions the schema has carried since migration 081 had
 * nowhere to be read.
 *
 * What it shows is everything the record holds — the cost broken into its four
 * parts, who ate, the per-person figure, the note, the recipe, and the linked
 * expense if there is one. What it lets you change is narrower, and the
 * difference is the point: participants and items are not editable here,
 * because changing who ate a meal changes a per-person figure the Home may
 * already have settled against. Correcting that is a delete and a re-record,
 * which is visible in the history, rather than an edit, which is not.
 */
export function MealDetailSheet({
  meal,
  currency,
  open,
  onClose,
}: {
  meal: MealView | null;
  currency: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [name, setName] = useState("");
  const [mealDate, setMealDate] = useState("");
  const [source, setSource] = useState<string>("home_cooked");
  const [mealType, setMealType] = useState<string>("other");
  const [baseCost, setBaseCost] = useState("0");
  const [prepCost, setPrepCost] = useState("0");
  const [deliveryCost, setDeliveryCost] = useState("0");
  const [otherCost, setOtherCost] = useState("0");
  const [note, setNote] = useState("");
  const [recipe, setRecipe] = useState("");

  // Reset the form to the meal each time a different one is opened. Derived
  // during render rather than in an effect, the same way the add sheet resets
  // its participants — React's own answer to "reset state when a prop changes".
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (meal && meal.id !== loadedId) {
    setLoadedId(meal.id);
    setEditing(false);
    setConfirmingDelete(false);
    setError(null);
    setName(meal.name);
    setMealDate(meal.mealDate);
    setSource(meal.source);
    setMealType(meal.mealType);
    setBaseCost(paiseToRupeeString(meal.baseCostPaise));
    setPrepCost(paiseToRupeeString(meal.prepCostPaise));
    setDeliveryCost(paiseToRupeeString(meal.deliveryCostPaise));
    setOtherCost(paiseToRupeeString(meal.otherCostPaise));
    setNote(meal.note ?? "");
    setRecipe(meal.recipeInstructions ?? "");
  }

  if (!meal) return null;

  const eaters = meal.participants.length;
  const perPersonPaise = eaters > 0 ? Math.round(meal.totalCostPaise / eaters) : 0;

  async function save() {
    if (!meal) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/food/meals/${meal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mealDate,
          source,
          mealType,
          baseCostPaise: rupeesToPaise(baseCost),
          prepCostPaise: rupeesToPaise(prepCost),
          deliveryCostPaise: rupeesToPaise(deliveryCost),
          otherCostPaise: rupeesToPaise(otherCost),
          note: note.trim() === "" ? null : note.trim(),
          recipeInstructions: recipe.trim() === "" ? null : recipe.trim(),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        // The refusal a person is most likely to meet is the RLS one — only the
        // member who recorded a meal, or a lead, may change it — so it is worth
        // saying that rather than "something went wrong".
        setError(body?.error?.message ?? "Only whoever recorded this meal, or a lead, can change it.");
        return;
      }
      toast(`${name} updated.`);
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!meal) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/food/meals/${meal.id}`, { method: "DELETE" });
      if (!response.ok) {
        setError("Only whoever recorded this meal, or a lead, can delete it.");
        return;
      }
      toast(`${meal.name} removed from the history.`);
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? "Edit meal" : meal.name}>
      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-3">
          <Field label="Name" htmlFor="meal_name">
            <Input id="meal_name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>

          <Field label="Date" htmlFor="meal_date">
            <Input
              id="meal_date"
              type="date"
              value={mealDate}
              onChange={(event) => setMealDate(event.target.value)}
            />
          </Field>

          <Field label="Source" htmlFor="meal_source">
            <Select
              id="meal_source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              {SOURCES.map((value) => (
                <option key={value} value={value}>
                  {SOURCE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Meal" htmlFor="meal_type">
            <Select
              id="meal_type"
              value={mealType}
              onChange={(event) => setMealType(event.target.value)}
            >
              {TYPES.map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cost" htmlFor="meal_base">
              <Input
                id="meal_base"
                inputMode="decimal"
                value={baseCost}
                onChange={(event) => setBaseCost(event.target.value)}
              />
            </Field>
            <Field label="Preparation" htmlFor="meal_prep">
              <Input
                id="meal_prep"
                inputMode="decimal"
                value={prepCost}
                onChange={(event) => setPrepCost(event.target.value)}
              />
            </Field>
            <Field label="Delivery" htmlFor="meal_delivery">
              <Input
                id="meal_delivery"
                inputMode="decimal"
                value={deliveryCost}
                onChange={(event) => setDeliveryCost(event.target.value)}
              />
            </Field>
            <Field label="Other" htmlFor="meal_other">
              <Input
                id="meal_other"
                inputMode="decimal"
                value={otherCost}
                onChange={(event) => setOtherCost(event.target.value)}
              />
            </Field>
          </div>

          <Field label="Note" htmlFor="meal_note" hint="optional">
            <Input id="meal_note" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>

          <Field label="Recipe" htmlFor="meal_recipe" hint="optional, plain text">
            <Textarea
              id="meal_recipe"
              rows={5}
              value={recipe}
              onChange={(event) => setRecipe(event.target.value)}
            />
          </Field>

          {/*
            Named here rather than discovered on save. Somebody opening an edit
            form expects to be able to change everything on it, and the two
            things they cannot change are the two with consequences elsewhere.
          */}
          <p className="caption-text text-text-muted">
            Who ate it and what was in it cannot be changed here — the per-person
            figure may already have been settled against. Delete the meal and
            record it again instead.
          </p>

          <div className="mt-2 flex gap-2">
            <Button block loading={busy} onClick={save}>
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="caption-text text-text-muted">
              {formatDate(meal.mealDate)} · {SOURCE_LABEL[meal.source] ?? meal.source}
              {meal.mealType === "other" ? "" : ` · ${meal.mealType}`}
            </p>
          </div>

          <section>
            <p className="eyebrow-text mb-2">What it cost</p>
            <dl className="flex flex-col gap-1.5">
              <Line label="Cost" paise={meal.baseCostPaise} currency={currency} />
              {meal.prepCostPaise > 0 ? (
                <Line label="Preparation" paise={meal.prepCostPaise} currency={currency} />
              ) : null}
              {meal.deliveryCostPaise > 0 ? (
                <Line label="Delivery" paise={meal.deliveryCostPaise} currency={currency} />
              ) : null}
              {meal.otherCostPaise > 0 ? (
                <Line label="Other" paise={meal.otherCostPaise} currency={currency} />
              ) : null}
              <div className="mt-1 border-t border-border pt-1.5">
                <Line label="Total" paise={meal.totalCostPaise} currency={currency} strong />
              </div>
              {eaters > 0 && meal.totalCostPaise > 0 ? (
                <p className="caption-text text-text-muted">
                  {formatMoney(perPersonPaise, { currency })} each · {eaters}{" "}
                  {eaters === 1 ? "person" : "people"}
                </p>
              ) : null}
            </dl>
          </section>

          <section>
            <p className="eyebrow-text mb-2">Who ate it</p>
            {eaters === 0 ? (
              <p className="caption-text text-text-muted">Nobody was recorded.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {meal.participants.map((participant) => (
                  <li
                    key={participant.memberId}
                    className="rounded-full border border-border px-3 py-1.5 text-[13px]"
                  >
                    {participant.displayName}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {meal.items.length > 0 ? (
            <section>
              <p className="eyebrow-text mb-2">What was in it</p>
              <ul className="flex flex-col gap-1">
                {meal.items.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="min-w-0 truncate">{item.name}</span>
                    {/* An item may carry no cost of its own — the meal's total
                        is not the sum of its items, and an unpriced ingredient
                        is the ordinary case. */}
                    {item.costPaise !== null && item.costPaise > 0 ? (
                      <span className="tabular shrink-0 text-text-muted">
                        {formatMoney(item.costPaise, { currency })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {meal.note ? (
            <section>
              <p className="eyebrow-text mb-2">Note</p>
              <p className="text-[14px]">{meal.note}</p>
            </section>
          ) : null}

          {meal.recipeInstructions ? (
            <section>
              <p className="eyebrow-text mb-2">How to make it again</p>
              {/* Plain text, by specification — no parsing, no step numbering. */}
              <p className="whitespace-pre-wrap text-[14px]">{meal.recipeInstructions}</p>
            </section>
          ) : null}

          <section>
            <p className="eyebrow-text mb-2">Expense</p>
            {/*
              The chip is icon-only, which is right on a ledger row where it
              sits beside an amount and wrong here, where there is room to say
              what it does. The words are added around it rather than inside it,
              because the inline use is the common one and does not want them.
            */}
            <div className="flex items-center gap-2">
              <LinkExpenseChip mealId={meal.id} expenseId={meal.expenseId} currency={currency} />
              <p className="caption-text text-text-muted">
                {meal.expenseId
                  ? "Linked to an expense. Unlinking leaves the expense alone."
                  : "Not linked to an expense. Linking is optional, both ways."}
              </p>
            </div>
          </section>

          <div className="mt-2 flex flex-col gap-2">
            <Button block onClick={() => setEditing(true)}>
              Edit
            </Button>

            {confirmingDelete ? (
              <div className="rounded-[var(--radius-sm)] border border-border bg-surface-2 p-3">
                <p className="caption-text mb-2.5">
                  Remove {meal.name} from the history?
                  {meal.expenseId
                    ? " The expense it is linked to is not affected."
                    : ""}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" loading={busy} onClick={remove}>
                    Delete it
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <Button block variant="ghost" onClick={() => setConfirmingDelete(true)}>
                Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function Line({
  label,
  paise,
  currency,
  strong = false,
}: {
  label: string;
  paise: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[14px]">
      <dt className={strong ? "font-medium" : "text-text-muted"}>{label}</dt>
      <dd className={strong ? "tabular font-medium" : "tabular"}>
        {formatMoney(paise, { currency })}
      </dd>
    </div>
  );
}
