"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { AmountKeypad } from "@/components/ui/amount-keypad";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { BottomSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/infra/supabase/client";
import { compressImage } from "@/lib/utils/image";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import type {
  ExpenseCategoryRow,
  MoneyMode,
  SplitBasis,
} from "@/lib/types/database";
import type { MemberView } from "@/lib/types/domain";

/**
 * S-17 — the add-expense sheet. The most-used screen in the app.
 *
 * Target from the spec: three taps and a number. The keypad has focus on open,
 * the category is one tap, and every other control already defaults correctly —
 * today, paid by me, split equally. The metadata row only expands when tapped.
 */
export function AddExpenseSheet({
  open,
  onClose,
  categories,
  members,
  me,
  houseId,
  currency,
  today,
  approvalThresholdPaise,
  moneyMode,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  categories: ExpenseCategoryRow[];
  members: MemberView[];
  me: MemberView;
  houseId: string;
  currency: string;
  today: string;
  approvalThresholdPaise: number;
  /**
   * 'pot' attributes the whole amount to whoever paid, so the sheet stops
   * talking about shares — in a family home there is nothing to divide, and a
   * line reading "your share ₹412" invents a debt that does not exist.
   */
  moneyMode: MoneyMode;
  /**
   * Set when the sheet was opened from natural-language entry (LLM spec section
   * 7.4). The fields are suggestions: the user still taps save, and `warn` puts
   * the amber "check these" note above them.
   */
  prefill?: {
    amount: string;
    category: string;
    expense_date: string;
    description: string;
    warn?: boolean;
  } | null;
}) {
  const router = useRouter();
  const toast = useToast();

  const [amount, setAmount] = useState("0");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [expenseDate, setExpenseDate] = useState(today);
  const [paidBy, setPaidBy] = useState(me.id);
  const defaultBasis: SplitBasis = moneyMode === "pot" ? "payer" : "equal";
  const [splitBasis, setSplitBasis] = useState<SplitBasis>(defaultBasis);
  const [description, setDescription] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState<"none" | "date" | "payer" | "split" | "meal">("none");
  const [mealId, setMealId] = useState("");
  const [meals, setMeals] = useState<{ id: string; name: string }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (expanded !== "meal" || meals !== null) return;
    fetch("/api/food/meals?limit=15")
      .then((r) => r.json())
      .then((body) => setMeals(body.meals ?? []));
  }, [expanded, meals]);

  // A proposal fills the form once, when the sheet opens with one. Everything
  // after that is the user's typing and is never overwritten. Adjusting state
  // during render rather than in an effect is React's own answer to "derive
  // state from a prop that changed": the alternative re-renders twice.
  const [appliedPrefill, setAppliedPrefill] = useState(prefill ?? null);
  if (open && prefill && prefill !== appliedPrefill) {
    setAppliedPrefill(prefill);
    setAmount(prefill.amount);
    setExpenseDate(prefill.expense_date);
    setDescription(prefill.description);
    const matched = categories.find((category) => category.name === prefill.category);
    if (matched) setCategoryId(matched.id);
  }

  const preview = useSplitPreview({
    open,
    amount,
    expenseDate,
    splitBasis,
    paidBy,
  });
  const amountPaise = Math.round(Number(amount || "0") * 100);
  const needsApproval = amountPaise > approvalThresholdPaise;

  async function onSave() {
    setSaving(true);
    setError(null);

    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        category_id: categoryId,
        expense_date: expenseDate,
        description,
        split_basis: splitBasis,
        paid_by_member_id: paidBy,
        receipt_url: receiptUrl ?? "",
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(
        body?.error?.details?.fields
          ? Object.values(body.error.details.fields)[0] as string
          : (body?.error?.message ?? "That did not save"),
      );
      return;
    }

    if (mealId) {
      await fetch(`/api/food/meals/${mealId}/link-expense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseId: body.id }),
      });
    }

    const share = preview
      ? ` Your share: ${formatMoney(preview.your_share_paise, { currency })}.`
      : "";
    toast(
      needsApproval
        ? "Saved. Waiting for someone to approve it."
        : `${formatMoney(amountPaise, { currency })} added.${share}`,
      "success",
    );

    reset();
    onClose();
    router.refresh();
  }

  function reset() {
    setAmount("0");
    setDescription("");
    setReceiptUrl(null);
    setExpenseDate(today);
    setPaidBy(me.id);
    setSplitBasis(defaultBasis);
    setExpanded("none");
    setMealId("");
    setMeals(null);
    setError(null);
  }

  async function onPickReceipt(file: File) {
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const supabase = createClient();
      const path = `${houseId}/${crypto.randomUUID()}.${compressed.extension}`;

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(path, compressed.blob, {
          contentType: compressed.blob.type || "image/webp",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // The bucket is private, so what is stored is the object path. A signed
      // URL is minted per view and never persisted.
      setReceiptUrl(path);
    } catch {
      setError("The receipt would not upload. The expense still saves without it.");
    } finally {
      setUploading(false);
    }
  }

  const activeMembers = members.filter((member) => member.status === "active");
  const payerName =
    paidBy === me.id
      ? "me"
      : (activeMembers.find((member) => member.id === paidBy)?.displayName ?? "someone");

  return (
    <BottomSheet open={open} onClose={onClose} title="Add an expense">
      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      {prefill?.warn ? (
        <div className="mb-3">
          <Alert tone="warning">Check these before saving.</Alert>
        </div>
      ) : null}

      <AmountKeypad value={amount} onChange={setAmount} />

      <div className="my-4 flex flex-wrap gap-2">
        {categories
          .filter((category) => category.active)
          .map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryId(category.id)}
              aria-pressed={categoryId === category.id}
              className={cn(
                "rounded-full border px-3 py-2 text-[13px]",
                categoryId === category.id
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border bg-surface-2 text-text-muted",
              )}
            >
              {category.icon ? `${category.icon} ` : ""}
              {category.name}
            </button>
          ))}
      </div>

      {/* The metadata line: three chips, each opening only its own control. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 border-y border-border py-3 text-[13px]">
        <Chip
          active={expanded === "date"}
          onClick={() => setExpanded(expanded === "date" ? "none" : "date")}
        >
          {expenseDate === today ? "Today" : expenseDate}
        </Chip>
        <span className="text-text-subtle">·</span>
        <Chip
          active={expanded === "payer"}
          onClick={() => setExpanded(expanded === "payer" ? "none" : "payer")}
        >
          Paid by {payerName}
        </Chip>
        <span className="text-text-subtle">·</span>
        <Chip
          active={expanded === "split"}
          onClick={() => setExpanded(expanded === "split" ? "none" : "split")}
        >
          {splitBasis === "payer"
            ? "House expense"
            : splitBasis === "equal"
              ? "Split equal"
              : splitBasis === "room_rent"
                ? "Split by room"
                : "Custom split"}
        </Chip>
        <span className="text-text-subtle">·</span>
        <Chip
          active={expanded === "meal"}
          onClick={() => setExpanded(expanded === "meal" ? "none" : "meal")}
        >
          {mealId ? (meals?.find((m) => m.id === mealId)?.name ?? "Linked to a meal") : "Link to a meal"}
        </Chip>
      </div>

      {expanded === "date" ? (
        <Field label="Date" htmlFor="expense_date" hint="today, or up to 180 days back">
          <Input
            id="expense_date"
            type="date"
            max={today}
            value={expenseDate}
            onChange={(event) => setExpenseDate(event.target.value)}
          />
        </Field>
      ) : null}

      {expanded === "payer" ? (
        <Field label="Paid by" htmlFor="paid_by">
          <Select
            id="paid_by"
            value={paidBy}
            onChange={(event) => setPaidBy(event.target.value)}
          >
            {activeMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.id === me.id ? "Me" : member.displayName}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {expanded === "split" ? (
        <Field label="Split" htmlFor="split_basis">
          <Select
            id="split_basis"
            value={splitBasis}
            onChange={(event) => setSplitBasis(event.target.value as SplitBasis)}
          >
            {/*
              Pot mode offers the split options too, and simply does not start
              on one. A family that wants to divide a holiday between the adults
              should be able to, and locking the control away would mean
              switching the whole house's mode to do it once.
            */}
            <option value="payer">A house expense — nobody owes anybody</option>
            <option value="equal">Equally across the house</option>
            <option value="room_rent">By room, for rent</option>
          </Select>
          <p className="caption-text mt-1.5 text-text-muted">
            {splitBasis === "payer"
              ? "Recorded against whoever paid, and counted in the budget. It creates no debt."
              : "By room divides each room's rent among its occupants. An empty room's rent is a house cost, split by everybody."}
          </p>
        </Field>
      ) : null}

      {expanded === "meal" ? (
        <Field label="Link to a meal" htmlFor="meal_link" hint="optional, never required">
          <Select id="meal_link" value={mealId} onChange={(event) => setMealId(event.target.value)}>
            <option value="">Not linked</option>
            {(meals ?? []).map((meal) => (
              <option key={meal.id} value={meal.id}>
                {meal.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field label="Note" htmlFor="description" hint="optional">
        <Input
          id="description"
          value={description}
          placeholder="Weekly vegetables"
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      <div className="mb-4">
        <label
          className="label-text inline-flex cursor-pointer items-center gap-2 text-primary"
          htmlFor="receipt"
        >
          {uploading
            ? "Uploading…"
            : receiptUrl
              ? "Receipt attached — replace"
              : "Add receipt"}
        </label>
        <input
          id="receipt"
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPickReceipt(file);
          }}
        />
      </div>

      <p className="caption-text mb-2 text-center text-text-muted" aria-live="polite">
        {preview
          ? `Your share: ${formatMoney(preview.your_share_paise, { currency })} · ${preview.heads} ${
              preview.heads === 1 ? "person" : "people"
            }`
          : " "}
      </p>

      <Button
        block
        loading={saving}
        disabled={amountPaise <= 0 || !categoryId}
        onClick={onSave}
      >
        {needsApproval
          ? "Save — needs approval"
          : `Save ${formatMoney(amountPaise, { currency })}`}
      </Button>
    </BottomSheet>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        "rounded-full px-2 py-1",
        active ? "bg-primary text-primary-fg" : "text-text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

interface Preview {
  heads: number;
  your_share_paise: number;
  amount_paise: number;
}

/**
 * The live "your share" line calls the real calculator on the server rather
 * than approximating in the browser — otherwise the number under the button
 * could disagree with the number that gets saved, which is precisely the kind
 * of small dishonesty that makes a house stop trusting the ledger.
 */
function useSplitPreview({
  open,
  amount,
  expenseDate,
  splitBasis,
  paidBy,
}: {
  open: boolean;
  amount: string;
  expenseDate: string;
  splitBasis: SplitBasis;
  paidBy: string;
}): Preview | null {
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (!open) return;
    const paise = Math.round(Number(amount || "0") * 100);
    if (paise <= 0) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/expenses/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            expense_date: expenseDate,
            split_basis: splitBasis,
            paid_by_member_id: paidBy,
          }),
        });
        if (!response.ok || cancelled) return;
        setPreview(await response.json());
      } catch {
        // A preview that cannot be fetched is not worth an error message; the
        // save path reports for real.
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, amount, expenseDate, splitBasis, paidBy]);

  const paise = Math.round(Number(amount || "0") * 100);
  return paise > 0 && preview?.amount_paise === paise ? preview : null;
}
