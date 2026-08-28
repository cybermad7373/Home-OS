/**
 * The adapter vocabulary — docs/10-LLM-SPEC.md section 1.
 *
 * Every model call in HouseOS goes through `LlmProvider.complete`. The call
 * sites know nothing about providers, wire formats or keys, which is what makes
 * "works with no key configured" a property of the six call sites rather than
 * of every file that might want a sentence written for it.
 */

export type LlmPurpose =
  | "schedule"
  | "digest"
  | "nl_parse"
  | "rule_parse"
  | "food_ideas"
  | "food_normalise";

/**
 * The subset of JSON Schema the three call sites actually use, and therefore
 * the subset `validateAgainstSchema` implements. Anything richer would be
 * unverified code: a provider is sent the schema, but the guarantee that the
 * response matches it is ours, and a validator that claims more than it checks
 * is worse than one that claims less.
 */
export interface JsonSchema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  format?: string;
  description?: string;
}

export interface LlmRequest {
  purpose: LlmPurpose;
  system: string;
  user: string;
  /** The response is validated against this before it is returned. */
  schema: JsonSchema;
  maxTokens: number;
  temperature: number;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LlmResponse<T> {
  ok: boolean;
  data?: T;
  raw?: string;
  error?: string;
  usage?: LlmUsage;
  latencyMs: number;
}

export interface LlmProvider {
  /** Registry id, e.g. `groq`. Written into `llm_runs`, so it never changes. */
  name: string;
  model: string;
  complete<T>(req: LlmRequest): Promise<LlmResponse<T>>;
}

/** What a transport is handed. The key lives here and nowhere else. */
export interface TransportConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  /** `native` sends a JSON-mode flag; `schema` sends the schema too. */
  jsonMode: "native" | "schema" | "prompt";
}

export type Transport = (
  config: TransportConfig,
  req: LlmRequest,
  signal: AbortSignal,
) => Promise<TransportResult>;

/**
 * A transport reports the wire outcome and nothing more. Parsing, validation,
 * retry and logging are the adapter's, so that all three transports get exactly
 * the same treatment and none of them can quietly skip a guarantee.
 */
export interface TransportResult {
  /** HTTP status, or 0 when the request never completed. */
  status: number;
  text?: string;
  usage?: LlmUsage;
  error?: string;
}
