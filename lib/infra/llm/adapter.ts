import { getProvider, resolveBaseUrl, resolveModel, type ProviderDescriptor } from "./providers";
import { parseJson, validateAgainstSchema } from "./schema";
import { anthropicTransport } from "./transports/anthropic";
import { geminiTransport } from "./transports/gemini";
import { openAiChatTransport } from "./transports/openai-chat";
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
  Transport,
  TransportResult,
} from "./types";

/**
 * The adapter — docs/10-LLM-SPEC.md section 1.
 *
 * Seven guarantees, all of them enforced here rather than in any transport, so
 * that a new wire format cannot quietly arrive without one:
 *
 *   never throws · 20 s timeout · exactly one retry on a network error or 5xx ·
 *   JSON mode where the provider has one · schema validation before returning ·
 *   an `llm_runs` row for every call including failures · the key held in a
 *   local variable for one request and never logged.
 */

export const TIMEOUT_MS = 20_000;
export const RETRY_BACKOFF_MS = 1_000;

const TRANSPORTS: Record<string, Transport> = {
  "openai-chat": openAiChatTransport,
  gemini: geminiTransport,
  anthropic: anthropicTransport,
};

export function transportFor(id: string): Transport | undefined {
  return TRANSPORTS[id];
}

/** How a failure is classified for the credential status — spec section 3.6. */
export type FailureKind = "rejected" | "rate_limited" | "transient" | "invalid" | null;

export interface LlmRunRecord {
  purpose: LlmRequest["purpose"];
  provider: string;
  model: string;
  inputPayload: unknown;
  outputPayload: unknown;
  accepted: boolean;
  validationErrors: string[] | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
  error: string | null;
}

export interface ProviderOptions {
  descriptor: ProviderDescriptor;
  apiKey: string;
  model?: string | null;
  baseUrl?: string | null;
  /**
   * Where a completed call is recorded. Injected rather than imported so the
   * adapter stays free of Supabase and can be exercised with nothing running.
   */
  onRun?: (record: LlmRunRecord) => void | Promise<void>;
  /** Told how the provider answered, so a house's credential status can follow. */
  onOutcome?: (kind: FailureKind) => void | Promise<void>;
  /** Test seam. Defaults to the transport named by the descriptor. */
  transport?: Transport;
  /** Test seam. Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Builds a provider bound to one decrypted key.
 *
 * The key is a closure variable and is never copied anywhere else: not into the
 * run record, not into an error string, not into a response body.
 */
export function createProvider(options: ProviderOptions): LlmProvider {
  const descriptor = options.descriptor;
  const transport = options.transport ?? transportFor(descriptor.transport);
  const model = resolveModel(descriptor, options.model);
  const baseUrl = resolveBaseUrl(descriptor, options.baseUrl);
  const sleep = options.sleep ?? defaultSleep;

  return {
    name: descriptor.id,
    model,

    async complete<T>(req: LlmRequest): Promise<LlmResponse<T>> {
      const started = Date.now();

      const finish = async (
        response: LlmResponse<T>,
        parts: {
          outputPayload?: unknown;
          validationErrors?: string[] | null;
          failure?: FailureKind;
        },
      ): Promise<LlmResponse<T>> => {
        const record: LlmRunRecord = {
          purpose: req.purpose,
          provider: descriptor.id,
          model,
          // The payload builder is the only code permitted to construct LLM
          // input, and what it built is what is stored — section 4.
          inputPayload: { system: req.system, user: safeJson(req.user) },
          outputPayload: parts.outputPayload ?? null,
          accepted: response.ok,
          validationErrors: parts.validationErrors ?? null,
          promptTokens: response.usage?.promptTokens ?? null,
          completionTokens: response.usage?.completionTokens ?? null,
          latencyMs: response.latencyMs,
          error: response.error ?? null,
        };

        // A logging failure must not turn a good answer into a bad one.
        try {
          await options.onRun?.(record);
        } catch (error) {
          console.warn("[llm] run not logged", error);
        }
        try {
          await options.onOutcome?.(parts.failure ?? null);
        } catch (error) {
          console.warn("[llm] outcome not recorded", error);
        }

        return response;
      };

      if (!transport) {
        return finish(
          { ok: false, error: `unknown transport ${descriptor.transport}`, latencyMs: 0 },
          { failure: "transient" },
        );
      }
      if (!baseUrl) {
        return finish(
          { ok: false, error: "no base URL configured for this provider", latencyMs: 0 },
          { failure: "rejected" },
        );
      }

      let result: TransportResult | null = null;

      // Exactly one retry, and only on a network error or a 5xx. A validation
      // failure is never retried: the same prompt produces the same shape, and
      // a second call spends the house's quota to be told so twice.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        result = await runOnce(transport, { baseUrl, model, apiKey: options.apiKey, jsonMode: descriptor.jsonMode }, req);
        if (!shouldRetry(result) || attempt === 1) break;
        await sleep(RETRY_BACKOFF_MS);
      }

      const latencyMs = Date.now() - started;
      const wire = result!;

      if (wire.error !== undefined || wire.text === undefined) {
        return finish(
          { ok: false, error: wire.error ?? "empty response", latencyMs },
          { failure: classify(wire) },
        );
      }

      const parsed = parseJson(wire.text);
      if (!parsed.ok) {
        return finish(
          {
            ok: false,
            error: "the response was not JSON",
            raw: wire.text,
            usage: wire.usage,
            latencyMs,
          },
          { outputPayload: { raw: wire.text }, failure: "invalid" },
        );
      }

      const errors = validateAgainstSchema(parsed.value, req.schema);
      if (errors.length > 0) {
        return finish(
          {
            ok: false,
            error: `schema: ${errors.join("; ")}`,
            raw: wire.text,
            usage: wire.usage,
            latencyMs,
          },
          { outputPayload: parsed.value, validationErrors: errors, failure: "invalid" },
        );
      }

      return finish(
        {
          ok: true,
          data: parsed.value as T,
          raw: wire.text,
          usage: wire.usage,
          latencyMs,
        },
        { outputPayload: parsed.value, failure: null },
      );
    },
  };
}

async function runOnce(
  transport: Transport,
  config: { baseUrl: string; model: string; apiKey: string; jsonMode: ProviderDescriptor["jsonMode"] },
  req: LlmRequest,
): Promise<TransportResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await transport(config, req, controller.signal);
  } catch (error) {
    // A transport is not supposed to throw. If one does, it is still not
    // allowed to reach a call site: "never throws" is the first guarantee.
    const message = (error as Error)?.name === "AbortError" ? "timed out" : String(error);
    return { status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function shouldRetry(result: TransportResult): boolean {
  if (result.status === 0) return result.error !== "timed out";
  return result.status >= 500;
}

function classify(result: TransportResult): FailureKind {
  if (result.status === 401 || result.status === 403) return "rejected";
  if (result.status === 429) return "rate_limited";
  return "transient";
}

/** Stores the payload as an object when it is one, and as text when it is not. */
function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * A provider built straight from a registry id. Used by the environment
 * fallback and by the verification endpoint, neither of which has a stored row
 * to read a descriptor from.
 */
export function providerFromId(
  id: string,
  options: Omit<ProviderOptions, "descriptor">,
): LlmProvider | null {
  const descriptor = getProvider(id);
  if (!descriptor) return null;
  return createProvider({ ...options, descriptor });
}
