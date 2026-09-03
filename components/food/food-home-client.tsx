"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddMealSheet } from "./add-meal-sheet";
import { SuggestionsCard } from "./suggestions-card";
import type { MemberView } from "@/lib/types/domain";

export function FoodHomeClient({
  members,
  today,
  currency,
  openAddOnMount,
}: {
  members: MemberView[];
  today: string;
  currency: string;
  openAddOnMount: boolean;
}) {
  const [adding, setAdding] = useState(openAddOnMount);

  return (
    <>
      <Button onClick={() => setAdding(true)} block className="mb-6">
        <Plus size={16} aria-hidden /> Record a meal
      </Button>

      <SuggestionsCard currency={currency} today={today} />

      <AddMealSheet
        open={adding}
        onClose={() => setAdding(false)}
        members={members}
        today={today}
      />
    </>
  );
}
