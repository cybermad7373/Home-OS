/**
 * The provider registry — docs/10-LLM-SPEC.md section 2.
 *
 * A provider is a data row, not a class. Nearly every service a house might
 * already have an account with speaks one of three wire formats, so adding
 * Fireworks or Nebius later is one entry here plus one line in the check
 * constraint, and no new TypeScript at all.
 *
 * Provider ids are permanent. They are written into `house_llm_credentials` and
 * into `llm_runs`; renaming one is a migration, not an edit.
 */

export type TransportId = "openai-chat" | "gemini" | "anthropic";

export interface ProviderModel {
  id: string;
  label: string;
  free: boolean;
}

export interface ProviderDescriptor {
  id: string;
  label: string;
  transport: TransportId;
  baseUrl: string;
  models: ProviderModel[];
  defaultModel: string;
  jsonMode: "native" | "schema" | "prompt";
  /** A client-side sanity check on an obvious paste error. Nothing more. */
  keyHint: { pattern: string; example: string };
  consoleUrl: string;
  /** The free-tier position, in one sentence. */
  notes: string;
  /** `custom` alone needs the house to supply its own endpoint. */
  requiresBaseUrl?: boolean;
}

/**
 * Ordered as the picker orders it: free tiers first, because the product's
 * premise is that a shared house pays nothing to run it.
 */
export const PROVIDERS: ProviderDescriptor[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    transport: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    // Google retires a numbered Gemini release and answers it with a 404, which
    // this app reads as a provider failure and quietly falls back from — so a
    // house sees its AI features stop working and nothing says why. The three
    // pinned 1.5/2.0/2.5 ids listed here until 2026-09-03 had all been retired.
    // The rolling aliases lead, because they survive the next retirement; the
    // pinned id is kept for a house that wants a fixed model.
    models: [
      { id: "gemini-flash-lite-latest", label: "Gemini Flash Lite (latest)", free: true },
      { id: "gemini-flash-latest", label: "Gemini Flash (latest)", free: true },
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", free: true },
    ],
    // Lite leads on the free tier's terms rather than on capability: measured
    // against a real key it answers in about a second where Flash takes two to
    // five, and Flash was returning 503 UNAVAILABLE under load while Lite kept
    // answering. Nothing this app asks a model to do is hard.
    defaultModel: "gemini-flash-lite-latest",
    jsonMode: "schema",
    keyHint: { pattern: "^AIza[A-Za-z0-9_\\-]{20,}$", example: "AIza…" },
    consoleUrl: "https://aistudio.google.com/apikey",
    notes: "Generous free tier on an AI Studio key. Nothing to pay to start.",
  },
  {
    id: "groq",
    label: "Groq",
    transport: "openai-chat",
    baseUrl: "https://api.groq.com/openai/v1",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", free: true },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (fastest)", free: true },
    ],
    defaultModel: "llama-3.3-70b-versatile",
    jsonMode: "native",
    keyHint: { pattern: "^gsk_[A-Za-z0-9]{20,}$", example: "gsk_…" },
    consoleUrl: "https://console.groq.com/keys",
    notes: "Free, with per-minute and per-day request limits well above what a house uses.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    transport: "openai-chat",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      {
        id: "meta-llama/llama-3.3-70b-instruct:free",
        label: "Llama 3.3 70B (free pool)",
        free: true,
      },
      { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", free: false },
    ],
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    jsonMode: "native",
    keyHint: { pattern: "^sk-or-v1-[A-Za-z0-9]{20,}$", example: "sk-or-v1-…" },
    consoleUrl: "https://openrouter.ai/keys",
    notes: "Free model pool: any model id suffixed `:free` costs nothing.",
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    transport: "openai-chat",
    baseUrl: "https://router.huggingface.co/v1",
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B", free: true },
      { id: "Qwen/Qwen2.5-7B-Instruct", label: "Qwen 2.5 7B", free: true },
    ],
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    jsonMode: "prompt",
    keyHint: { pattern: "^hf_[A-Za-z0-9]{20,}$", example: "hf_…" },
    consoleUrl: "https://huggingface.co/settings/tokens",
    notes: "A monthly inference credit on a free account.",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    transport: "openai-chat",
    baseUrl: "https://api.cerebras.ai/v1",
    models: [
      { id: "llama-3.3-70b", label: "Llama 3.3 70B", free: true },
      { id: "llama3.1-8b", label: "Llama 3.1 8B", free: true },
    ],
    defaultModel: "llama-3.3-70b",
    jsonMode: "native",
    keyHint: { pattern: "^csk-[A-Za-z0-9]{20,}$", example: "csk-…" },
    consoleUrl: "https://cloud.cerebras.ai",
    notes: "Free developer tier, rate-limited per minute.",
  },
  {
    id: "mistral",
    label: "Mistral",
    transport: "openai-chat",
    baseUrl: "https://api.mistral.ai/v1",
    models: [
      { id: "mistral-small-latest", label: "Mistral Small", free: true },
      { id: "open-mistral-nemo", label: "Mistral Nemo", free: true },
    ],
    defaultModel: "mistral-small-latest",
    jsonMode: "native",
    keyHint: { pattern: "^[A-Za-z0-9]{24,}$", example: "a 32-character string" },
    consoleUrl: "https://console.mistral.ai/api-keys",
    notes: "Free experiment tier after a phone verification.",
  },
  {
    id: "openai",
    label: "OpenAI",
    transport: "openai-chat",
    baseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini", free: false },
      { id: "gpt-4o", label: "GPT-4o", free: false },
    ],
    defaultModel: "gpt-4o-mini",
    jsonMode: "native",
    keyHint: { pattern: "^sk-[A-Za-z0-9_\\-]{20,}$", example: "sk-…" },
    consoleUrl: "https://platform.openai.com/api-keys",
    notes: "Paid. A house's whole month costs a few rupees on the mini model.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    transport: "anthropic",
    baseUrl: "https://api.anthropic.com",
    models: [
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", free: false },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", free: false },
      { id: "claude-opus-5", label: "Claude Opus 5", free: false },
    ],
    defaultModel: "claude-haiku-4-5-20251001",
    jsonMode: "schema",
    keyHint: { pattern: "^sk-ant-[A-Za-z0-9_\\-]{20,}$", example: "sk-ant-…" },
    consoleUrl: "https://console.anthropic.com/settings/keys",
    notes: "Paid, with prepaid credit.",
  },
  {
    id: "custom",
    label: "An OpenAI-compatible URL",
    transport: "openai-chat",
    baseUrl: "",
    models: [],
    defaultModel: "",
    jsonMode: "native",
    keyHint: { pattern: ".*", example: "often blank for a local server" },
    consoleUrl: "https://ollama.com",
    notes: "Self-hosted — Ollama or LM Studio on your own machine. A key is optional.",
    requiresBaseUrl: true,
  },
];

export function getProvider(id: string): ProviderDescriptor | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

/**
 * Model lists are a starting point, not a constraint: a typed model id is
 * accepted, because provider catalogues change faster than this repository
 * does. An unknown id is the provider's error to report, and verification
 * surfaces it before anything is saved.
 */
export function resolveModel(provider: ProviderDescriptor, requested?: string | null): string {
  const trimmed = requested?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : provider.defaultModel;
}

export function resolveBaseUrl(
  provider: ProviderDescriptor,
  requested?: string | null,
): string {
  const trimmed = requested?.trim();
  if (provider.requiresBaseUrl) return (trimmed ?? "").replace(/\/+$/, "");
  return (trimmed && trimmed.length > 0 ? trimmed : provider.baseUrl).replace(/\/+$/, "");
}

/** What the picker is given. It contains no secrets, so it needs no filtering. */
export function publicRegistry() {
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    models: provider.models,
    default_model: provider.defaultModel,
    key_hint: provider.keyHint,
    console_url: provider.consoleUrl,
    notes: provider.notes,
    requires_base_url: Boolean(provider.requiresBaseUrl),
    has_free_tier: provider.models.some((model) => model.free),
  }));
}
