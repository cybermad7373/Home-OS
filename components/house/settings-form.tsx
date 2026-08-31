"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatMoney, paiseToRupeeString, rupeesToPaise } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import type {
  EffortMode,
  HouseSettingsRow,
  HouseSettingsRowExtended,
  MoneyMode,
} from "@/lib/types/database";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * S-30 — house settings.
 *
 * Each number carries a live example, because "penalty rate" means nothing on
 * its own and "missing one dinner costs ₹150" means everything.
 */
export function SettingsForm({
  settings,
  inviteUrl,
  currency,
  llmConfigured,
}: {
  settings: HouseSettingsRowExtended;
  /** Null when the Home has no live link — nobody new can ask until one exists. */
  inviteUrl: string | null;
  currency: string;
  llmConfigured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [penaltyRate, setPenaltyRate] = useState(
    paiseToRupeeString(settings.penalty_rate_paise),
  );
  const [threshold, setThreshold] = useState(
    paiseToRupeeString(settings.expense_approval_threshold_paise),
  );
  const [autoConfirm, setAutoConfirm] = useState(String(settings.auto_confirm_hours));
  const [dow, setDow] = useState(String(settings.schedule_generation_dow));
  const [hour, setHour] = useState(String(settings.schedule_generation_hour));
  const [carryCap, setCarryCap] = useState(String(settings.carry_cap_percent));
  const [llmEnabled, setLlmEnabled] = useState(settings.llm_scheduling_enabled);
  const [moneyMode, setMoneyMode] = useState<MoneyMode>(settings.money_mode);
  const [effortMode, setEffortMode] = useState<EffortMode>(settings.effort_mode);
  const [penaltyEnabled, setPenaltyEnabled] = useState(settings.penalty_enabled);
  const [gameLayerEnabled, setGameLayerEnabled] = useState(settings.game_layer_enabled);
  const [dailyBudget, setDailyBudget] = useState(
    settings.daily_budget_paise ? paiseToRupeeString(settings.daily_budget_paise) : "",
  );
  const [link, setLink] = useState(inviteUrl);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "At ₹5 per point, missing one dinner costs ₹150." Cook dinner is 30 points.
  let penaltyExample = "";
  try {
    penaltyExample = formatMoney(rupeesToPaise(penaltyRate) * 30, { currency });
  } catch {
    penaltyExample = "—";
  }

  async function save() {
    setBusy(true);
    setError(null);

    const response = await fetch("/api/houses/current/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        penalty_rate: penaltyRate,
        expense_approval_threshold: threshold,
        auto_confirm_hours: Number(autoConfirm),
        schedule_generation_dow: Number(dow),
        schedule_generation_hour: Number(hour),
        carry_cap_percent: Number(carryCap),
        llm_scheduling_enabled: llmEnabled,
        money_mode: moneyMode,
        effort_mode: effortMode,
        penalty_enabled: penaltyEnabled,
        game_layer_enabled: gameLayerEnabled,
        daily_budget: dailyBudget,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(payload?.error?.message ?? "That did not work");
      return;
    }

    toast("Settings saved.", "success");
    startTransition(() => router.refresh());
  }

  async function rotate() {
    setBusy(true);
    const response = await fetch("/api/invitations", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      toast(payload?.error?.message ?? "That did not work", "danger");
      return;
    }

    setLink(payload.invite_url);
    setCopied(false);
    toast("New link. The old one stopped working immediately.", "success");
    startTransition(() => router.refresh());
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // A browser that refuses clipboard access is not an error worth a toast:
      // the link is on screen and can be selected by hand.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardTitle>Invite link</CardTitle>
        <CardDescription>
          Anyone holding this link can ask to join. Holding it grants nothing on
          its own — somebody here still has to let them in.
        </CardDescription>
        {link ? (
          <p className="my-3 break-all rounded-[10px] bg-surface-2 px-3 py-2 font-mono text-[13px]">
            {link}
          </p>
        ) : (
          <p className="my-3 text-text-muted">
            There is no live link. Nobody new can ask until you make one.
          </p>
        )}
        <div className="flex gap-2">
          {link ? (
            <Button variant="outline" size="sm" onClick={copyLink}>
              {copied ? "Copied" : "Copy link"}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" loading={busy} onClick={rotate}>
            {link ? "Replace this link" : "Make a link"}
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>How money works here</CardTitle>
        <CardDescription>
          The single most consequential setting in the app. It decides whether the
          month ends with a list of payments or with nothing owed at all.
        </CardDescription>
        <div className="mt-3 flex flex-col gap-2">
          <ModeOption
            name="money_mode"
            checked={moneyMode === "split"}
            onSelect={() => setMoneyMode("split")}
            title="Split between us"
            body="Every expense divides across the house, and the month nets down to who pays whom."
          />
          <ModeOption
            name="money_mode"
            checked={moneyMode === "pot"}
            onSelect={() => setMoneyMode("pot")}
            title="One shared pot"
            body="Spending is recorded against whoever paid and creates no debt. Nobody ends the month owing anybody."
          />
        </div>
        {moneyMode === "pot" ? (
          <Alert tone="info" className="mt-3">
            Settling up disappears from the app. Budgets and the running cost stay,
            and are the point.
          </Alert>
        ) : null}
      </Card>

      <Card>
        <CardTitle>Money</CardTitle>
        <div className="mt-3">
          <Field
            label="Approval threshold"
            htmlFor="threshold"
            hint="expenses above this need somebody else to approve"
          >
            <Input
              id="threshold"
              inputMode="decimal"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
            />
          </Field>

          <Field
            label="Daily budget"
            htmlFor="daily_budget"
            hint="what the house means to spend in a day — blank for no target"
          >
            <Input
              id="daily_budget"
              inputMode="decimal"
              value={dailyBudget}
              onChange={(event) => setDailyBudget(event.target.value)}
              placeholder="1500"
            />
          </Field>
          <p className="caption-text -mt-2 text-text-muted">
            {dailyBudget.trim()
              ? `Roughly ${monthlyEquivalent(dailyBudget, currency)} a month.`
              : "Without one, the running-cost screen shows the trend and passes no judgement."}
          </p>
        </div>
      </Card>

      <Card>
        <CardTitle>How chores are scored</CardTitle>
        <div className="mt-3 flex flex-col gap-2">
          <ModeOption
            name="effort_mode"
            checked={effortMode === "points"}
            onSelect={() => setEffortMode("points")}
            title="Points and a leaderboard"
            body="Everybody has a weekly target, and the house can see who is meeting theirs."
          />
          <ModeOption
            name="effort_mode"
            checked={effortMode === "rota"}
            onSelect={() => setEffortMode("rota")}
            title="Just a rota"
            body="The same fair distribution of work, with the scoring kept out of sight."
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Effort penalty</CardTitle>
        <CardDescription>
          Whether a point of unpaid effort turns into money at month end.
        </CardDescription>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="label-text">
            {penaltyEnabled
              ? "Deficit is charged at the rate below"
              : "Deficit is shown as points, and never costs money"}
          </span>
          <Button
            variant={penaltyEnabled ? "primary" : "outline"}
            size="sm"
            aria-pressed={penaltyEnabled}
            onClick={() => setPenaltyEnabled((value) => !value)}
          >
            {penaltyEnabled ? "On" : "Off"}
          </Button>
        </div>

        {penaltyEnabled ? (
          <div className="mt-3">
            <Field label="Rate per point" htmlFor="penalty_rate">
              <Input
                id="penalty_rate"
                inputMode="decimal"
                value={penaltyRate}
                onChange={(event) => setPenaltyRate(event.target.value)}
              />
            </Field>
            <p className="caption-text -mt-2 text-text-muted">
              At this rate, missing one dinner (30 points) costs {penaltyExample}. Set
              it to zero for the first month — everybody sees what they would have
              owed before any money moves.
            </p>
          </div>
        ) : (
          <CardDescription className="mt-2">
            The right setting wherever the people falling behind are children, or
            wherever charging each other would do more damage than the missed work.
          </CardDescription>
        )}
      </Card>

      <Card>
        <CardTitle>Chores</CardTitle>
        <div className="mt-3">
          <Field
            label="Auto-confirm window"
            htmlFor="auto_confirm"
            hint="hours before silence counts as approval"
          >
            <Input
              id="auto_confirm"
              type="number"
              min={1}
              max={168}
              value={autoConfirm}
              onChange={(event) => setAutoConfirm(event.target.value)}
            />
          </Field>
          <p className="caption-text -mt-2 mb-4 text-text-muted">
            Without a timeout, refusing to tap approve becomes a veto on other people
            earning points. That is the failure this window exists to prevent.
          </p>

          <Field label="Schedule generation day" htmlFor="dow">
            <Select id="dow" value={dow} onChange={(event) => setDow(event.target.value)}>
              {DAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Generation hour" htmlFor="hour" hint="house time, 0–23">
            <Input
              id="hour"
              type="number"
              min={0}
              max={23}
              value={hour}
              onChange={(event) => setHour(event.target.value)}
            />
          </Field>

          <Field
            label="Carry cap"
            htmlFor="carry_cap"
            hint="most a surplus or deficit may move next week's target, as a percentage"
          >
            <Input
              id="carry_cap"
              type="number"
              min={0}
              max={100}
              value={carryCap}
              onChange={(event) => setCarryCap(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Gamification</CardTitle>
        <CardDescription>
          Opt in to the game layer: streaks, badges, and game points. No leaderboard,
          no ranking — just personal progress. Admin-only toggle.
        </CardDescription>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="label-text">
            {gameLayerEnabled
              ? "Streaks and badges are visible to all members"
              : "Game layer is off — no streaks or badges shown"}
          </span>
          <Button
            variant={gameLayerEnabled ? "primary" : "outline"}
            size="sm"
            aria-pressed={gameLayerEnabled}
            onClick={() => setGameLayerEnabled((v: boolean | undefined) => !v)}
          >
            {gameLayerEnabled ? "On" : "Off"}
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>AI scheduling</CardTitle>
        <CardDescription>
          The rule engine always produces the schedule. When this is on and a key is
          configured, a model may propose an alternative — which is used only if it
          violates no hard constraint.
        </CardDescription>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="label-text">
            {llmConfigured
              ? "Let the model propose schedules"
              : "No AI key set up for this house yet"}
          </span>
          <Button
            variant={llmEnabled ? "primary" : "outline"}
            size="sm"
            disabled={!llmConfigured}
            aria-pressed={llmEnabled}
            onClick={() => setLlmEnabled((value) => !value)}
          >
            {llmEnabled ? "On" : "Off"}
          </Button>
        </div>
        <Link href="/admin/settings/ai" className="caption-text mt-3 inline-block underline">
          {llmConfigured ? "Change the key" : "Add a key"}
        </Link>
      </Card>

      <Button block loading={busy} onClick={save}>
        Save settings
      </Button>
    </div>
  );
}

/** A radio that reads as a choice with consequences rather than a form field. */
function ModeOption({
  name,
  checked,
  onSelect,
  title,
  body,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <label
      className={cn(
        "block cursor-pointer rounded-xl border p-3 transition-colors",
        checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span className="block font-medium">{title}</span>
      <span className="caption-text mt-0.5 block text-text-muted">{body}</span>
    </label>
  );
}

function monthlyEquivalent(dailyRupees: string, currency: string): string {
  try {
    return formatMoney(rupeesToPaise(dailyRupees) * 30, { currency });
  } catch {
    return "—";
  }
}
