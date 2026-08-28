import { z } from "zod";
import { CAPABILITIES } from "@/lib/domain/llm/capabilities";
import { PROVIDERS } from "@/lib/infra/llm/providers";

/** Section 10 of docs/05-API-SPEC.md, and section 3.4 of the LLM spec. */

const providerIds = PROVIDERS.map((provider) => provider.id) as [string, ...string[]];

export const providerIdSchema = z.enum(providerIds);

/**
 * The key is checked for length only. A per-provider pattern is a client-side
 * courtesy against an obvious paste error — the server refusing on a pattern
 * would mean a provider's new key format becomes an outage here.
 */
export const apiKeySchema = z
  .string()
  .trim()
  .min(8, "That key looks too short")
  .max(400, "That key looks too long");

export const modelSchema = z
  .string()
  .trim()
  .min(1, "Choose or type a model")
  .max(120, "That model name is too long");

export const baseUrlSchema = z
  .string()
  .trim()
  .url("Enter the full URL, including https://")
  .max(300);

export const verifyCredentialSchema = z.object({
  provider: providerIdSchema,
  model: modelSchema.optional(),
  base_url: baseUrlSchema.optional(),
  api_key: apiKeySchema,
});

export const putCredentialSchema = z.object({
  provider: providerIdSchema,
  model: modelSchema,
  base_url: baseUrlSchema.optional(),
  api_key: apiKeySchema,
  /** Set by the panel when the verify call answered `ok` for this same key. */
  verified: z.boolean().optional(),
});

export const parseTextSchema = z.object({
  text: z.string().trim().min(2, "Say what you spent or did").max(400),
});

/**
 * The six switches — AI-02, docs/10-LLM-SPEC.md section 3.6a.
 *
 * Every key optional, because the request is a merge rather than a replacement,
 * and at least one required, because a request that turns nothing is a request
 * that should not have been sent.
 */
export const capabilitiesSchema = z
  .object(
    Object.fromEntries(
      CAPABILITIES.map((capability) => [capability, z.boolean().optional()]),
    ) as Record<(typeof CAPABILITIES)[number], z.ZodOptional<z.ZodBoolean>>,
  )
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Nothing to change",
  });

export const digestQuerySchema = z.object({
  week_start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD form")
    .optional(),
});

export type VerifyCredentialInput = z.infer<typeof verifyCredentialSchema>;
export type PutCredentialInput = z.infer<typeof putCredentialSchema>;
