// One model call, from an Edge Function.
//
// The job half of `lib/infra/llm/adapter.ts`, cut down to what a scheduled job
// needs: three transports, a 20-second timeout, one retry, JSON extraction and
// an `llm_runs` row. There is no circuit breaker here — a job runs once an
// hour at most, so the latency it would save is not worth a second copy of the
// state machine (the app half keeps one for interactive calls).

import { fromPgBytea, openKey } from "./crypto.ts";

/**
 * The slice of the Supabase client this module uses, written out rather than
 * imported: `SupabaseClient` carries generics the generated types supply, and a
 * job only ever reads one row and inserts another.
 */
export interface JobClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> };
    };
    insert(row: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
}

export interface JobProvider {
  id: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  transport: "openai-chat" | "gemini" | "anthropic";
}

const REGISTRY: Record<string, { transport: JobProvider["transport"]; baseUrl: string }> = {
  gemini: { transport: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  groq: { transport: "openai-chat", baseUrl: "https://api.groq.com/openai/v1" },
  openrouter: { transport: "openai-chat", baseUrl: "https://openrouter.ai/api/v1" },
  huggingface: { transport: "openai-chat", baseUrl: "https://router.huggingface.co/v1" },
  cerebras: { transport: "openai-chat", baseUrl: "https://api.cerebras.ai/v1" },
  mistral: { transport: "openai-chat", baseUrl: "https://api.mistral.ai/v1" },
  openai: { transport: "openai-chat", baseUrl: "https://api.openai.com/v1" },
  anthropic: { transport: "anthropic", baseUrl: "https://api.anthropic.com" },
  custom: { transport: "openai-chat", baseUrl: "" },
};

interface CredentialRow {
  provider: string;
  model: string;
  base_url: string | null;
  key_ciphertext: string;
  key_iv: string;
  key_tag: string;
  key_version: number;
  status: string;
}

/**
 * The house's own key, or the environment fallback, or null — the same three
 * steps as `resolveLlm` in the app, for the same reason (LLM spec 3.5).
 */
export async function resolveJobProvider(
  supabase: JobClient,
  houseId: string,
): Promise<JobProvider | null> {
  const { data } = await supabase
    .from("house_llm_credentials")
    .select("provider, model, base_url, key_ciphertext, key_iv, key_tag, key_version, status")
    .eq("house_id", houseId)
    .maybeSingle();

  const row = data as CredentialRow | null;

  if (row) {
    if (row.status !== "active" && row.status !== "unverified") return null;
    const entry = REGISTRY[row.provider];
    if (!entry) return null;

    try {
      const apiKey = await openKey(
        {
          ciphertext: fromPgBytea(row.key_ciphertext),
          iv: fromPgBytea(row.key_iv),
          tag: fromPgBytea(row.key_tag),
          version: row.key_version,
        },
        houseId,
      );

      return {
        id: row.provider,
        model: row.model,
        apiKey,
        baseUrl: (row.base_url ?? entry.baseUrl).replace(/\/+$/, ""),
        transport: entry.transport,
      };
    } catch {
      return null;
    }
  }

  const envKey = Deno.env.get("LLM_API_KEY");
  if (!envKey) return null;
  const envProvider = Deno.env.get("LLM_PROVIDER") ?? "gemini";
  const entry = REGISTRY[envProvider];
  if (!entry) return null;

  return {
    id: envProvider,
    model: Deno.env.get("LLM_MODEL") ?? "gemini-2.0-flash",
    apiKey: envKey,
    baseUrl: (Deno.env.get("LLM_BASE_URL") ?? entry.baseUrl).replace(/\/+$/, ""),
    transport: entry.transport,
  };
}

export interface CompleteResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

const TIMEOUT_MS = 20_000;

export async function complete<T>(
  provider: JobProvider,
  request: { system: string; user: string; maxTokens: number; temperature: number },
): Promise<CompleteResult<T>> {
  const started = Date.now();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const wire = await send(provider, request, controller.signal);

      if (wire.retryable && attempt === 0) continue;
      if (wire.error) {
        return { ok: false, error: wire.error, latencyMs: Date.now() - started };
      }

      const parsed = extractJson(wire.text ?? "");
      if (parsed === null) {
        return {
          ok: false,
          error: "the response was not JSON",
          latencyMs: Date.now() - started,
        };
      }

      return {
        ok: true,
        data: parsed as T,
        latencyMs: Date.now() - started,
        promptTokens: wire.promptTokens,
        completionTokens: wire.completionTokens,
      };
    } catch (error) {
      const message = (error as Error)?.name === "AbortError" ? "timed out" : String(error);
      if (attempt === 1 || message === "timed out") {
        return { ok: false, error: message, latencyMs: Date.now() - started };
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, error: "no answer", latencyMs: Date.now() - started };
}

interface WireResult {
  text?: string;
  error?: string;
  retryable?: boolean;
  promptTokens?: number;
  completionTokens?: number;
}

async function send(
  provider: JobProvider,
  request: { system: string; user: string; maxTokens: number; temperature: number },
  signal: AbortSignal,
): Promise<WireResult> {
  if (provider.transport === "gemini") {
    const response = await fetch(
      `${provider.baseUrl}/models/${encodeURIComponent(provider.model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": provider.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: "user", parts: [{ text: request.user }] }],
          generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.maxTokens,
            responseMimeType: "application/json",
          },
        }),
        signal,
      },
    );

    const raw = await response.text();
    if (!response.ok) return { error: shortError(raw), retryable: response.status >= 500 };

    const body = JSON.parse(raw);
    return {
      text: ((body.candidates?.[0]?.content?.parts ?? []) as { text?: string }[])
        .map((part) => part.text ?? "")
        .join(""),
      promptTokens: body.usageMetadata?.promptTokenCount,
      completionTokens: body.usageMetadata?.candidatesTokenCount,
    };
  }

  if (provider.transport === "anthropic") {
    const response = await fetch(`${provider.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": provider.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
      }),
      signal,
    });

    const raw = await response.text();
    if (!response.ok) return { error: shortError(raw), retryable: response.status >= 500 };

    const body = JSON.parse(raw);
    return {
      text: ((body.content ?? []) as { text?: string }[])
        .map((block) => block.text ?? "")
        .join(""),
      promptTokens: body.usage?.input_tokens,
      completionTokens: body.usage?.output_tokens,
    };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    }),
    signal,
  });

  const raw = await response.text();
  if (!response.ok) return { error: shortError(raw), retryable: response.status >= 500 };

  const body = JSON.parse(raw);
  return {
    text: body.choices?.[0]?.message?.content ?? "",
    promptTokens: body.usage?.prompt_tokens,
    completionTokens: body.usage?.completion_tokens,
  };
}

function shortError(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed.length > 300 ? `${collapsed.slice(0, 299)}…` : collapsed;
}

/** The first balanced `{…}` block, ignoring braces inside string literals. */
export function extractJson(text: string): unknown {
  const opener = text.indexOf("{");
  if (opener < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = opener; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(opener, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/** Every call writes one, including failures. */
export async function logRun(
  supabase: JobClient,
  houseId: string,
  row: {
    purpose: string;
    provider: string;
    model: string;
    input: unknown;
    output: unknown;
    accepted: boolean;
    validationErrors: string[] | null;
    latencyMs: number;
    promptTokens?: number;
    completionTokens?: number;
    error?: string;
  },
): Promise<void> {
  await supabase.from("llm_runs").insert({
    house_id: houseId,
    purpose: row.purpose,
    provider: row.provider,
    model: row.model,
    input_payload: row.input,
    output_payload: row.output,
    accepted: row.accepted,
    validation_errors: row.validationErrors,
    prompt_tokens: row.promptTokens ?? null,
    completion_tokens: row.completionTokens ?? null,
    latency_ms: row.latencyMs,
    error: row.error ?? null,
  });
}
