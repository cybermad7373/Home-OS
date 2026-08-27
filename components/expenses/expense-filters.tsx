"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/sheet";
import type { ExpenseCategoryRow } from "@/lib/types/database";
import type { MemberView } from "@/lib/types/domain";

/**
 * The filter sheet from S-16.
 *
 * Filters live in the URL rather than in component state, so a filtered view is
 * a link somebody can send to the house — "look at what we spent on groceries
 * in July" is a URL, not a set of instructions.
 */
export function ExpenseFilters({
  categories,
  members,
}: {
  categories: ExpenseCategoryRow[];
  members: MemberView[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const current = {
    category: searchParams.get("category") ?? "",
    member: searchParams.get("member") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  };

  const [draft, setDraft] = useState(current);
  const activeCount = Object.values(current).filter(Boolean).length;

  function apply(next: typeof current) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("add");
    router.push(`/expenses?${params.toString()}`);
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setDraft(current);
          setOpen(true);
        }}
      >
        Filter
        {activeCount > 0 ? (
          <Badge tone="primary" className="ml-1">
            {activeCount}
          </Badge>
        ) : null}
      </Button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Filter expenses">
        <Field label="Category" htmlFor="filter_category">
          <Select
            id="filter_category"
            value={draft.category}
            onChange={(event) => setDraft({ ...draft, category: event.target.value })}
          >
            <option value="">Every category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Paid by" htmlFor="filter_member">
          <Select
            id="filter_member"
            value={draft.member}
            onChange={(event) => setDraft({ ...draft, member: event.target.value })}
          >
            <option value="">Anybody</option>
            {members
              .filter((member) => member.status !== "requested")
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
          </Select>
        </Field>

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="From" htmlFor="filter_from">
              <Input
                id="filter_from"
                type="date"
                value={draft.from}
                onChange={(event) => setDraft({ ...draft, from: event.target.value })}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="To" htmlFor="filter_to">
              <Input
                id="filter_to"
                type="date"
                value={draft.to}
                onChange={(event) => setDraft({ ...draft, to: event.target.value })}
              />
            </Field>
          </div>
        </div>

        <p className="caption-text mb-4 text-text-muted">
          A date range overrides the month picker.
        </p>

        <Button block onClick={() => apply(draft)}>
          Show them
        </Button>
        <Button
          block
          variant="ghost"
          className="mt-2"
          onClick={() => apply({ category: "", member: "", from: "", to: "" })}
        >
          Clear filters
        </Button>
      </BottomSheet>
    </>
  );
}
