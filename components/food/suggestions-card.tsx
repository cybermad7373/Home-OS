"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils/money";
import { PlanItButton } from "./plan-it-button";

interface ScoredFood {
  foodId: string;
  name: string;
  score: number;
  reasons: string[];
}

interface AiIdea {
  name: string;
  description: string;
  estimatedPerPersonPaise: number;
  items: string[];
}

interface SuggestionsResponse {
  library: { suggestions: ScoredFood[]; message: string | null; coldStart: boolean };
  ai: AiIdea[] | null;
}

/**
 * Try Today — docs/15-FOOD-SPEC.md section 6. Two clearly separated groups:
 * what the reader can see is which half is the Home's own history and which
 * half is invention (section 6, intro). The AI half simply is not rendered
 * when it comes back null — that is the correct outcome, never an error
 * (section 9.5).
 */
export function SuggestionsCard({ currency, today }: { currency: string; today: string }) {
  const [data, setData] = useState<SuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/food/suggestions")
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardTitle>Suggestions</CardTitle>
        <p className="caption-text text-text-muted">Loading…</p>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardTitle>Suggestions</CardTitle>

      <div className="mb-3">
        <p className="label-text mb-1.5 text-text-muted">From Your Home</p>
        {/* Cold start shows both: the honest message and the most recently
            eaten in place of a fabricated score (section 6.1). An empty
            candidate set shows only the message — there is nothing to list. */}
        {data.library.message ? (
          <p className="caption-text mb-1.5 text-text-muted">{data.library.message}</p>
        ) : null}
        {data.library.suggestions.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {data.library.suggestions.map((s) => (
              <li key={s.foodId} className="flex items-center justify-between rounded-[10px] bg-surface-2 px-3 py-2">
                <div>
                  <p className="text-[15px] text-text">{s.name}</p>
                  {s.reasons.length > 0 ? (
                    <p className="caption-text text-text-muted">{s.reasons.join(" · ")}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {s.score > 0 ? <span className="label-text text-primary">{s.score}</span> : null}
                  <PlanItButton name={s.name} foodId={s.foodId} minDate={today} />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {data.ai && data.ai.length > 0 ? (
        <div>
          <p className="label-text mb-1.5 text-text-muted">AI Ideas</p>
          <ul className="flex flex-col gap-2">
            {data.ai.map((idea) => (
              <li key={idea.name} className="rounded-[10px] border border-dashed border-border px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-[15px] text-text">{idea.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="caption-text text-text-muted">
                      est. {formatMoney(idea.estimatedPerPersonPaise, { currency })}/person
                    </span>
                    <PlanItButton name={idea.name} minDate={today} />
                  </div>
                </div>
                <p className="caption-text text-text-muted">{idea.description}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
