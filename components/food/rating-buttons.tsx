"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";

type Rating = "like" | "okay" | "dislike";

const OPTIONS: { value: Rating; label: string }[] = [
  { value: "like", label: "❤️" },
  { value: "okay", label: "😐" },
  { value: "dislike", label: "👎" },
];

/**
 * The vote — docs/15-FOOD-SPEC.md section 5.1. A standing fact about a food,
 * not about one meal instance: rating this one changes what every future
 * recommendation for this dish looks like, for the person who cast it.
 * Anyone can rate at any time, and change their mind — this always writes,
 * never toggles off.
 */
export function RatingButtons({ foodId, current }: { foodId: string; current?: Rating | null }) {
  const router = useRouter();
  const [rating, setRating] = useState<Rating | null | undefined>(current);
  const [saving, setSaving] = useState(false);

  async function rate(value: Rating) {
    if (saving) return;
    setSaving(true);
    const previous = rating;
    setRating(value);
    const response = await fetch("/api/food/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foodId, rating: value }),
    });
    setSaving(false);
    if (!response.ok) {
      setRating(previous);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex gap-1" role="group" aria-label="Rate this food">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.value}
          aria-pressed={rating === option.value}
          onClick={() => rate(option.value)}
          className={cn(
            "touch-target rounded-[var(--radius-xs)] px-1.5 text-[16px]",
            rating === option.value ? "bg-surface-2" : "opacity-50 hover:opacity-100",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
