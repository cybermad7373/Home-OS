"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
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
  const [data, setData] = useState<SuggestionsResponse["library"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [ai, setAi] = useState<AiIdea[] | null>(null);
  const [aiPending, setAiPending] = useState(true);

  // Two requests, because they are two answers with very different costs. The
  // library half is a database read; the AI half is a provider round trip the
  // adapter allows 20 seconds and one retry for. Awaiting them together — which
  // is what this did — meant a slow or rate-limited model could keep the
  // home's own history off the screen for the better part of a minute, for a
  // half of the card that is explicitly optional.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/food/suggestions?half=library")
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setData(body?.library ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    fetch("/api/food/suggestions?half=ai")
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setAi(body?.ai ?? null);
      })
      .catch(() => {
        // A failed AI half is the documented outcome, not an error state
        // (section 9.5): the card renders its other half and says nothing.
      })
      .finally(() => {
        if (!cancelled) setAiPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <p className="eyebrow-text mb-3">Try today</p>
        <div className="shimmer h-4 w-2/3 rounded-full" />
        <div className="shimmer mt-2 h-4 w-1/2 rounded-full" />
      </Card>
    );
  }

  if (!data && !ai) return null;

  return (
    <Card>
      <p className="eyebrow-text mb-3">Try today</p>

      <div className="mb-4">
        <p className="rule-label eyebrow-text mb-2">What this home cooks</p>
        {/* Cold start shows both: the honest message and the most recently
            eaten in place of a fabricated score (section 6.1). An empty
            candidate set shows only the message — there is nothing to list. */}
        {data?.message ? (
          <p className="caption-text mb-1.5 text-text-muted">{data.message}</p>
        ) : null}
        {data && data.suggestions.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {data.suggestions.map((s) => (
              <li
                key={s.foodId}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2"
              >
                <div>
                  <p className="text-[15px] text-text">{s.name}</p>
                  {s.reasons.length > 0 ? (
                    <p className="caption-text text-text-muted">{s.reasons.join(" · ")}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {s.score > 0 ? (
                    <span className="readout text-[13px] leading-none text-text-subtle">
                      {s.score}
                    </span>
                  ) : null}
                  <PlanItButton name={s.name} foodId={s.foodId} minDate={today} />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {aiPending ? (
        <div>
          <p className="rule-label eyebrow-text mb-2">Ideas from the model</p>
          <div className="shimmer h-4 w-1/2 rounded-full" />
        </div>
      ) : null}

      {ai && ai.length > 0 ? (
        <div>
          {/* The dashed edge is the whole point: the reader can see at a
              glance which half is the home's own history and which half is
              invention (spec section 6). */}
          <p className="rule-label eyebrow-text mb-2">Ideas from the model</p>
          <ul className="flex flex-col gap-2">
            {ai.map((idea) => (
              <li key={idea.name} className="rounded-[var(--radius-sm)] border border-dashed border-border px-3 py-2">
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
