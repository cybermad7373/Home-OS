import {
  logLlmRun,
  markCredentialStatus,
  readSealedCredential,
} from "@/lib/data/llm";
import { createProvider, type FailureKind } from "./adapter";
import { isBreakerOpen, openImmediately, recordFailure, recordSuccess } from "./breaker";
import { openKey } from "./crypto";
import { getProvider } from "./providers";
import type { LlmProvider } from "./types";

/**
 * Resolution order — docs/10-LLM-SPEC.md section 3.5.
 *
 * 1. The house's own row, when its status is `active` or `unverified` and the
 *    circuit breaker is not open.
 * 2. Otherwise the environment fallback, which serves a single-house self-host
 *    and the developer's machine.
 * 3. Otherwise `null`, which every call site reads as "take the deterministic
 *    branch". No error is logged: a house with no key has not failed at
 *    anything.
 *
 * A house whose own key is `disabled` does not fall through to the environment.
 * Its admin chose a provider and that provider refused the key; quietly
 * spending the operator's quota instead is not a fallback, it is a surprise.
 */
export async function resolveLlm(houseId: string): Promise<LlmProvider | null> {
  const stored = await readSealedCredential(houseId);

  if (stored) {
    const usable = stored.status === "active" || stored.status === "unverified";
    if (!usable || isBreakerOpen(houseId)) return null;

    const descriptor = getProvider(stored.provider);
    if (!descriptor) return null;

    let apiKey: string;
    try {
      apiKey = await openKey(stored.sealed, houseId);
    } catch (error) {
      // A ciphertext that will not open is a configuration fault — usually a
      // rotated master key with the old version removed. It is not the house's
      // mistake, so the row is marked failing rather than disabled.
      await markCredentialStatus(houseId, "failing", `the stored key could not be opened: ${(error as Error).message}`);
      return null;
    }

    return createProvider({
      descriptor,
      apiKey,
      model: stored.model,
      baseUrl: stored.baseUrl,
      onRun: (record) => logLlmRun(houseId, record),
      onOutcome: (kind) => applyOutcome(houseId, kind),
    });
  }

  return environmentProvider(houseId);
}

export async function isLlmEnabled(houseId: string): Promise<boolean> {
  return (await resolveLlm(houseId)) !== null;
}

/**
 * The fallback of section 3.5 step 2. It writes `llm_runs` like any other
 * provider — the log is per house, not per key — but it has no credential row
 * to move between statuses, so only the breaker applies.
 */
function environmentProvider(houseId: string): LlmProvider | null {
  const apiKey = process.env.LLM_API_KEY?.trim();
  const providerId = process.env.LLM_PROVIDER?.trim() || "gemini";
  if (!apiKey) return null;
  if (isBreakerOpen(houseId)) return null;

  const descriptor = getProvider(providerId);
  if (!descriptor) return null;

  return createProvider({
    descriptor,
    apiKey,
    model: process.env.LLM_MODEL?.trim() || null,
    baseUrl: process.env.LLM_BASE_URL?.trim() || null,
    onRun: (record) => logLlmRun(houseId, record),
    onOutcome: (kind) => {
      if (kind === null) recordSuccess(houseId);
      else recordFailure(houseId);
    },
  });
}

async function applyOutcome(houseId: string, kind: FailureKind): Promise<void> {
  if (kind === null) {
    recordSuccess(houseId);
    await markCredentialStatus(houseId, "active", null);
    return;
  }

  if (kind === "rejected") {
    // 401 or 403. Not transient, and not worth two more twenty-second waits.
    openImmediately(houseId);
    await markCredentialStatus(houseId, "disabled", "the provider rejected the key");
    return;
  }

  if (kind === "invalid") {
    // The key worked; the model answered badly. That is the call site's problem
    // to handle and says nothing about the credential.
    recordSuccess(houseId);
    return;
  }

  const opened = recordFailure(houseId);
  if (opened) {
    await markCredentialStatus(
      houseId,
      "failing",
      kind === "rate_limited"
        ? "the provider's rate limit or quota was reached"
        : "the provider did not answer",
    );
  }
}
