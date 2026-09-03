"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

/**
 * S-06b — the AI panel, at `/onboarding/ai` and again at
 * `/admin/settings/ai`. docs/10-LLM-SPEC.md section 3.4.
 *
 * The key belongs to the house. An admin picks a provider, follows the link to
 * that provider's console, pastes what they minted, and either verifies it or
 * saves it unverified. **Skip is a first-class button and is the expected
 * path**: every feature has a deterministic branch, so a house with no key
 * loses nothing but the prose.
 *
 * The plaintext key crosses the wire exactly twice — once to verify, once to
 * save — and is never echoed back. Afterwards this panel shows `•••• 4f2a`.
 */

interface ProviderOption {
  id: string;
  label: string;
  models: { id: string; label: string; free: boolean }[];
  default_model: string;
  key_hint: { pattern: string; example: string };
  console_url: string;
  notes: string;
  requires_base_url: boolean;
  has_free_tier: boolean;
}

export interface AiConfig {
  configured: boolean;
  provider?: string;
  model?: string;
  base_url?: string | null;
  key_last4?: string;
  status?: "unverified" | "active" | "failing" | "disabled";
  last_verified_at?: string | null;
  last_error?: string | null;
}

export function AiSettings({
  initialConfig,
  onSkip,
  skipLabel = "Skip for now",
  onSaved,
}: {
  initialConfig: AiConfig;
  onSkip?: () => void;
  skipLabel?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [config, setConfig] = useState<AiConfig>(initialConfig);
  const [providerId, setProviderId] = useState(initialConfig.provider ?? "gemini");
  const [model, setModel] = useState(initialConfig.model ?? "");
  const [baseUrl, setBaseUrl] = useState(initialConfig.base_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState<"verify" | "save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/providers")
      .then((response) => response.json())
      .then((body: { providers?: ProviderOption[] }) => {
        if (cancelled || !body?.providers) return;
        setProviders(body.providers);
        // A house with nothing stored starts on the first free provider's own
        // default model, so the field is never empty in front of the admin.
        setModel((current) =>
          current || body.providers!.find((entry) => entry.id === providerId)?.default_model || "",
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const provider = useMemo(
    () => providers.find((entry) => entry.id === providerId),
    [providers, providerId],
  );

  const keyLooksWrong =
    apiKey.length > 0 && provider ? !new RegExp(provider.key_hint.pattern).test(apiKey) : false;

  async function verify() {
    setBusy("verify");
    setError(null);
    setVerifyNote(null);

    const response = await fetch("/api/ai/credentials/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: providerId,
        model: model || undefined,
        base_url: baseUrl || undefined,
        api_key: apiKey,
      }),
    });
    const body = await response.json();
    setBusy(null);

    if (!response.ok) {
      setError(body?.error?.message ?? "That didn't go through");
      return;
    }

    if (body.ok) {
      setVerified(true);
      setVerifyNote(`Answered in ${body.latency_ms} ms as ${body.model_echo}.`);
      return;
    }

    setVerified(false);
    setVerifyNote(
      body.error === "PROVIDER_REJECTED_KEY"
        ? "The provider rejected that key. Check you copied all of it."
        : `Couldn't reach the provider: ${body.detail ?? "no answer"}`,
    );
  }

  async function save() {
    setBusy("save");
    setError(null);

    const response = await fetch("/api/ai/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: providerId,
        model,
        base_url: baseUrl || undefined,
        api_key: apiKey,
        verified,
      }),
    });
    const body = await response.json();
    setBusy(null);

    if (!response.ok) {
      setError(body?.error?.message ?? "That didn't save");
      return;
    }

    setConfig(body);
    setApiKey("");
    toast("AI features are on", "success");
    router.refresh();
    onSaved?.();
  }

  async function remove() {
    setBusy("remove");
    setError(null);
    const response = await fetch("/api/ai/credentials", { method: "DELETE" });
    const body = await response.json();
    setBusy(null);

    if (!response.ok) {
      setError(body?.error?.message ?? "That didn't work");
      return;
    }

    setConfig({ configured: false });
    setVerified(false);
    setVerifyNote(null);
    toast("Key removed. The house runs on its own numbers again.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The screen's own title is on the page header. This panel is also
          rendered inside onboarding, where there is no header, so it keeps the
          explanation and drops the second copy of the title. */}
      <div>
        <p className="caption-text text-text-muted">
          Optional. With a key, the house gets a written weekly summary, a model&apos;s
          second opinion on the rota, and plain-English entry — &ldquo;paid 840 for
          vegetables yesterday&rdquo;. Without one, everything still works on the
          numbers alone.
        </p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {config.configured && config.status === "disabled" ? (
        <Alert tone="danger" title="The key was rejected">
          {config.last_error ?? "The provider refused it."} AI features are off until it
          is replaced.
        </Alert>
      ) : null}

      {config.configured && config.status === "failing" ? (
        <Alert tone="warning" title="The provider is not answering">
          {config.last_error ?? "Rate limit or an outage."} The house is running on its
          own numbers meanwhile, and it will try again within the hour.
        </Alert>
      ) : null}

      {config.configured ? (
        <Card>
          <CardTitle>Current key</CardTitle>
          <CardDescription>
            {config.provider} · {config.model} · •••• {config.key_last4} ·{" "}
            {config.status === "active"
              ? "verified"
              : config.status === "unverified"
                ? "saved without a check"
                : config.status}
          </CardDescription>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            loading={busy === "remove"}
            onClick={remove}
          >
            Remove key
          </Button>
        </Card>
      ) : null}

      <Card>
        <CardTitle>{config.configured ? "Replace it" : "Add a key"}</CardTitle>

        <div className="mt-3">
          <Field label="Provider" htmlFor="provider">
            <Select
              id="provider"
              value={providerId}
              onChange={(event) => {
                // Switching provider re-arms everything: a key minted at one
                // console is not a key at another, and a model id rarely
                // carries across either.
                const next = event.target.value;
                setProviderId(next);
                setModel(providers.find((entry) => entry.id === next)?.default_model ?? "");
                setVerified(false);
                setVerifyNote(null);
              }}
            >
              {providers.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                  {entry.has_free_tier ? " — free tier" : ""}
                </option>
              ))}
            </Select>
          </Field>

          {provider ? (
            <p className="caption-text -mt-2 mb-4 text-text-muted">
              {provider.notes}{" "}
              <a
                href={provider.console_url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Get a key
              </a>
            </p>
          ) : null}

          {provider?.requires_base_url ? (
            <Field
              label="Base URL"
              htmlFor="base_url"
              hint="e.g. http://localhost:11434/v1"
            >
              <Input
                id="base_url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="http://localhost:11434/v1"
              />
            </Field>
          ) : null}

          <Field
            label="Model"
            htmlFor="model"
            hint="type any model your provider offers"
          >
            <Input
              id="model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              list="model-options"
            />
          </Field>
          <datalist id="model-options">
            {(provider?.models ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
                {entry.free ? " (free)" : ""}
              </option>
            ))}
          </datalist>

          <Field
            label="API key"
            htmlFor="api_key"
            hint={provider ? `looks like ${provider.key_hint.example}` : undefined}
            error={keyLooksWrong ? "That doesn't look like a key for this provider" : undefined}
          >
            <Input
              id="api_key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setVerified(false);
              }}
              placeholder={provider?.key_hint.example}
            />
          </Field>

          {verifyNote ? (
            <div className="mb-3">
              <Alert tone={verified ? "success" : "warning"}>{verifyNote}</Alert>
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button
              variant="outline"
              block
              disabled={apiKey.length < 8}
              loading={busy === "verify"}
              onClick={verify}
            >
              Verify
            </Button>
            <Button
              block
              disabled={apiKey.length < 8 || model.trim() === ""}
              loading={busy === "save"}
              onClick={save}
            >
              Save
            </Button>
          </div>

          <p className="caption-text mt-2 text-text-muted">
            The key is encrypted before it is stored, and it is never shown again —
            only its last four characters.
          </p>
        </div>
      </Card>

      {onSkip ? (
        <Button variant="ghost" block onClick={onSkip}>
          {skipLabel}
        </Button>
      ) : null}
    </div>
  );
}
