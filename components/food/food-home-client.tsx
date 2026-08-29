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
    <div className="flex flex-col gap-4">
      <Button onClick={() => setAdding(true)} className="self-start">
        <Plus size={16} aria-hidden /> Add Meal
      </Button>

      <SuggestionsCard currency={currency} />

      <AddMealSheet
        open={adding}
        onClose={() => setAdding(false)}
        members={members}
        today={today}
      />
    </div>
  );
}
