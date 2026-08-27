"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatMoney, paiseToRupeeString } from "@/lib/utils/money";
import type {
  ExpenseCategoryRow,
  RecurringExpenseRow,
  SplitBasis,
} from "@/lib/types/database";
import type { MemberView } from "@/lib/types/domain";

/**
 * S-23 — recurring expenses.
 *
 * Rent, internet, the maid: the things that arrive every month whether or not
 * anybody remembers to log them. The daily job posts them; this screen only
 * defines them.
 */
export function RecurringList({
  recurring,
  categories,
  members,
  currency,
  isAdmin,
}: {
  recurring: RecurringExpenseRow[];
  categories: ExpenseCategoryRow[];
  members: MemberView[];
  currency: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<RecurringExpenseRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(payload?.error?.message ?? "That did not work");
      return false;
    }

    setEditing(null);
    toast("Saved.", "success");
    router.refresh();
    return true;
  }

  const categoryName = (id: string) =>
    categories.find((category) => category.id === id)?.name ?? "Other";

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {isAdmin ? (
        <Button block onClick={() => setEditing("new")}>
          Add a recurring expense
        </Button>
      ) : null}

      {recurring.length === 0 ? (
        <EmptyState
          title="Nothing recurring yet"
          body="Rent, internet and the maid post themselves once they are set up here, on the day of the month you choose."
          action={
            isAdmin ? (
              <Button size="sm" onClick={() => setEditing("new")}>
                Set one up
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {recurring.map((item) => (
        <Card key={item.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium">
                {item.name}
                {item.active ? null : <Badge tone="neutral">Paused</Badge>}
              </p>
              <p className="caption-text text-text-muted">
                {categoryName(item.category_id)} · day {item.day_of_month} of each month ·{" "}
                {item.split_basis === "room_rent" ? "split by room" : "split equally"}
              </p>
              <p className="caption-text text-text-subtle">
                Next posts {item.next_run_date}
              </p>
            </div>
            <div className="text-right">
              <p className="tabular font-semibold">
                {formatMoney(item.amount_paise, { currency })}
              </p>
              {isAdmin ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(item)}>
                  Edit
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      ))}

      {editing ? (
        <RecurringSheet
          item={editing === "new" ? null : editing}
          categories={categories}
          members={members}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(body) =>
            editing === "new"
              ? send("/api/recurring", "POST", body)
              : send(`/api/recurring/${editing.id}`, "PATCH", body)
          }
          onDelete={
            editing === "new"
              ? undefined
              : () => send(`/api/recurring/${editing.id}`, "DELETE")
          }
        />
      ) : null}
    </div>
  );
}

function RecurringSheet({
  item,
  categories,
  members,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  item: RecurringExpenseRow | null;
  categories: ExpenseCategoryRow[];
  members: MemberView[];
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(
    item ? paiseToRupeeString(item.amount_paise) : "0.00",
  );
  const [categoryId, setCategoryId] = useState(item?.category_id ?? categories[0]?.id ?? "");
  const [paidBy, setPaidBy] = useState(item?.paid_by_member_id ?? "");
  const [splitBasis, setSplitBasis] = useState<SplitBasis>(item?.split_basis ?? "equal");
  const [dayOfMonth, setDayOfMonth] = useState(String(item?.day_of_month ?? 1));
  const [active, setActive] = useState(item?.active ?? true);

  const activeMembers = members.filter((member) => member.status === "active");

  return (
    <BottomSheet open onClose={onClose} title={item ? item.name : "New recurring expense"}>
      <Field label="Name" htmlFor="recurring_name">
        <Input
          id="recurring_name"
          value={name}
          placeholder="Rent"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field label="Amount" htmlFor="recurring_amount">
        <Input
          id="recurring_amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>

      <Field label="Category" htmlFor="recurring_category">
        <Select
          id="recurring_category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Day of the month"
        htmlFor="recurring_day"
        hint="1 to 28, so no month is ever too short"
      >
        <Input
          id="recurring_day"
          type="number"
          min={1}
          max={28}
          value={dayOfMonth}
          onChange={(event) => setDayOfMonth(event.target.value)}
        />
      </Field>

      <Field label="Split" htmlFor="recurring_split">
        <Select
          id="recurring_split"
          value={splitBasis}
          onChange={(event) => setSplitBasis(event.target.value as SplitBasis)}
        >
          <option value="equal">Equally across the house</option>
          <option value="room_rent">By room, for rent</option>
        </Select>
      </Field>

      <Field label="Paid by" htmlFor="recurring_payer" hint="who fronts it each month">
        <Select
          id="recurring_payer"
          value={paidBy}
          onChange={(event) => setPaidBy(event.target.value)}
        >
          <option value="">Decide at posting time</option>
          {activeMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </Select>
      </Field>

      <div className="mb-6 flex items-center justify-between gap-3">
        <span className="label-text">Active</span>
        <Button
          type="button"
          size="sm"
          variant={active ? "primary" : "outline"}
          aria-pressed={active}
          onClick={() => setActive((value) => !value)}
        >
          {active ? "Posting" : "Paused"}
        </Button>
      </div>

      <Button
        block
        loading={busy}
        onClick={() =>
          onSave({
            name,
            amount,
            category_id: categoryId,
            paid_by_member_id: paidBy || undefined,
            split_basis: splitBasis,
            day_of_month: Number(dayOfMonth),
            active,
          })
        }
      >
        Save
      </Button>

      {onDelete ? (
        <Button
          block
          variant="ghost"
          className="mt-2 text-danger"
          loading={busy}
          onClick={onDelete}
        >
          Delete it
        </Button>
      ) : null}
      <p className="caption-text mt-2 text-text-muted">
        Deleting stops future posting. Everything it already posted stays exactly where
        it is.
      </p>
    </BottomSheet>
  );
}
