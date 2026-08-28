import { readCapabilities } from "@/lib/data/llm";
import { isCapabilityOn, type Capability } from "@/lib/domain/llm/capabilities";
import { resolveLlm } from "./resolve";
import type { LlmProvider } from "./types";

/**
 * The AI Router — docs/10-LLM-SPEC.md section 1, new in specification 3.0.
 *
 * `route` is `resolveLlm` (section 3.5) plus one check: the Home's capability
 * switch for this call site. That is the whole of it, and it is a function
 * rather than a class because there is nothing to hold.
 *
 * **Why a router at all, when it is four lines.** It is the one place that can
 * answer "should this Home make this call", and having exactly one such place
 * is what makes AI-02 enforceable rather than aspirational. A call site that
 * reaches for `resolveLlm` directly has bypassed the capability switch, and
 * that is a defect `tests/unit/llm-router.test.ts` looks for by scanning the
 * source — a bypass is invisible at runtime, which is precisely why it needs a
 * test that reads files rather than one that runs code.
 */

export type { Capability };
export { CAPABILITIES, CAPABILITY_LABEL } from "@/lib/domain/llm/capabilities";

/**
 * The single entry point. Returns null when this Home cannot or should not make
 * this call — no key, capability off, breaker open, credential disabled.
 *
 * Every call site reads null as "take the deterministic branch", with no error
 * logged and nothing shown to the user. A capability that is off behaves
 * **exactly** as if no key were configured, for that feature alone: no banner,
 * no upsell, no error (section 3.6a).
 */
export async function route(
  houseId: string,
  capability: Capability,
): Promise<LlmProvider | null> {
  // The switch is checked before the key is resolved rather than after, so a
  // Home that turned a capability off never decrypts a key for a call it is
  // not going to make.
  if (!(await capabilityEnabled(houseId, capability))) return null;
  return resolveLlm(houseId);
}

export async function capabilityEnabled(
  houseId: string,
  capability: Capability,
): Promise<boolean> {
  return isCapabilityOn(await readCapabilities(houseId), capability);
}
