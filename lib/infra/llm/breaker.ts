/**
 * The circuit breaker — docs/10-LLM-SPEC.md section 8.
 *
 * Three consecutive failures disable LLM calls for that house for an hour.
 * The point is not to protect the provider; it is that a house whose key has
 * been revoked should stop paying twenty seconds of latency per generation to
 * be told so again, and should reach its deterministic path immediately.
 *
 * State is per process and deliberately in memory: it is a latency guard, not
 * a correctness one. A cold instance opens the circuit again after three more
 * failures, and the persistent half of the same fact — `status = 'failing'`,
 * `last_error` — is in `house_llm_credentials`, which every instance reads.
 */

export const FAILURE_THRESHOLD = 3;
export const OPEN_FOR_MS = 60 * 60 * 1000;

interface BreakerState {
  consecutiveFailures: number;
  openedUntil: number;
}

const states = new Map<string, BreakerState>();

function stateFor(houseId: string): BreakerState {
  let state = states.get(houseId);
  if (!state) {
    state = { consecutiveFailures: 0, openedUntil: 0 };
    states.set(houseId, state);
  }
  return state;
}

export function isBreakerOpen(houseId: string, now = Date.now()): boolean {
  return stateFor(houseId).openedUntil > now;
}

export function recordFailure(houseId: string, now = Date.now()): boolean {
  const state = stateFor(houseId);
  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
    state.openedUntil = now + OPEN_FOR_MS;
    return true;
  }
  return false;
}

/** A success closes it. A key that started working again is working again. */
export function recordSuccess(houseId: string): void {
  states.set(houseId, { consecutiveFailures: 0, openedUntil: 0 });
}

/** A rejected key is not a transient failure: stop calling at once. */
export function openImmediately(houseId: string, now = Date.now()): void {
  states.set(houseId, { consecutiveFailures: FAILURE_THRESHOLD, openedUntil: now + OPEN_FOR_MS });
}

export function resetBreakers(): void {
  states.clear();
}

/** Reset only one house's breaker — used when an admin replaces a credential. */
export function resetBreakerForHouse(houseId: string): void {
  states.delete(houseId);
}
