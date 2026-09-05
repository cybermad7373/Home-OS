import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { defaultRule, ruleFor } from "@/lib/infra/http/rate-limit";

/**
 * The proxy, with Supabase replaced by a stub.
 *
 * Everything here is wiring, and wiring is where this pass's defects were: the
 * limiter is one `if` in one file, and an `if` that classifies the wrong
 * requests is a limiter with a hole in it or an app that refuses its own
 * screens. The counting itself is proved against a real Postgres in
 * `tests/integration/rate-limit.test.ts`.
 */

const rpc = vi.fn();
const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser },
    rpc,
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:55321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon";

const { updateSession } = await import("@/lib/infra/supabase/proxy");

function request(path: string, method = "GET"): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), { method });
}

const signedIn = { data: { user: { id: "11111111-1111-4111-8111-111111111111" } } };

describe("what counts as a write", () => {
  it("counts the four verbs that change something, under the API", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(ruleFor(method, "/api/rooms"), method).toBeTruthy();
    }
  });

  it("does not count a read, whatever it costs", () => {
    // Refusing a GET costs somebody their screen and stops nothing: a read goes
    // through RLS to the caller's own household.
    expect(ruleFor("GET", "/api/expenses")).toBeNull();
    expect(ruleFor("HEAD", "/api/expenses")).toBeNull();
    expect(ruleFor("OPTIONS", "/api/expenses")).toBeNull();
  });

  it("does not count a page navigation", () => {
    expect(ruleFor("POST", "/expenses")).toBeNull();
    expect(ruleFor("GET", "/home")).toBeNull();
  });
});

/**
 * docs/05-API-SPEC.md section 15, row by row. The table has been in the
 * specification since the beginning and had nothing enforcing it, so each row
 * is asserted rather than assumed — a ceiling that is quietly ten times what
 * the specification says is not a ceiling anybody agreed to.
 */
describe("the specified ceilings", () => {
  const cases: [string, string, string, number, number][] = [
    ["POST", "/api/expenses", "expenses", 30, 3600],
    ["POST", "/api/chores/6f9a1b2c-3d4e-4f5a-8b9c-0d1e2f3a4b5c/confirm", "chore-response", 60, 3600],
    ["POST", "/api/chores/6f9a1b2c-3d4e-4f5a-8b9c-0d1e2f3a4b5c/reject", "chore-response", 60, 3600],
    ["POST", "/api/food/meals", "meals", 30, 86400],
    ["POST", "/api/decisions", "decisions", 20, 86400],
    ["POST", "/api/decisions/6f9a1b2c-3d4e-4f5a-8b9c-0d1e2f3a4b5c/respond", "decision-response", 100, 3600],
    ["POST", "/api/decisions/approve-all", "approve-all", 20, 3600],
    ["POST", "/api/join/some-long-invite-token/request", "join-request", 5, 3600],
    ["POST", "/api/ai/parse", "ai-parse", 20, 86400],
  ];

  for (const [method, path, scope, limit, windowSeconds] of cases) {
    it(`${method} ${path} is ${limit} per ${windowSeconds}s`, () => {
      expect(ruleFor(method, path)).toEqual({ scope, limit, windowSeconds });
    });
  }

  it("puts everything else on 300 an hour", () => {
    expect(ruleFor("POST", "/api/rooms")).toEqual({
      scope: "write",
      limit: 300,
      windowSeconds: 3600,
    });
  });

  it("does not let a trailing slash walk past a ceiling", () => {
    expect(ruleFor("POST", "/api/expenses/")?.scope).toBe("expenses");
  });

  it("keeps approve-all off the per-decision bucket", () => {
    // `/api/decisions/approve-all` also matches the shape of a decision id, and
    // 20 an hour is not 100 an hour.
    expect(ruleFor("POST", "/api/decisions/approve-all")?.limit).toBe(20);
  });
});

describe("the configured default", () => {
  it("falls back rather than throwing on a value that is not a number", () => {
    process.env.RATE_LIMIT_WRITES = "not-a-number";
    process.env.RATE_LIMIT_WINDOW_SECONDS = "-4";
    expect(defaultRule()).toEqual({ scope: "write", limit: 300, windowSeconds: 3600 });
    delete process.env.RATE_LIMIT_WRITES;
    delete process.env.RATE_LIMIT_WINDOW_SECONDS;
  });
});

describe("the proxy", () => {
  beforeEach(() => {
    rpc.mockReset();
    getUser.mockReset();
    getUser.mockResolvedValue(signedIn);
  });

  it("puts a policy with a nonce on every response", async () => {
    const response = await updateSession(request("/home"));
    const policy = response.headers.get("Content-Security-Policy");
    expect(policy).toMatch(/'nonce-[^']+'/);
    expect(policy).toContain("'strict-dynamic'");
  });

  it("answers a refused write with 429 and says how long to wait", async () => {
    rpc.mockResolvedValue({
      data: [{ allowed: false, hits: 121, retry_after_seconds: 34 }],
      error: null,
    });

    const response = await updateSession(request("/api/expenses", "POST"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("34");
    const body = await response.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    // The policy is on the refusal too; nothing leaves this function without it.
    expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
  });

  it("lets an allowed write through", async () => {
    rpc.mockResolvedValue({
      data: [{ allowed: true, hits: 3, retry_after_seconds: 57 }],
      error: null,
    });

    const response = await updateSession(request("/api/expenses", "POST"));
    expect(response.status).toBe(200);
  });

  it("does not count a read at all", async () => {
    await updateSession(request("/api/expenses"));
    expect(rpc, "no round trip on a read").not.toHaveBeenCalled();
  });

  it("fails open when the counter cannot be reached", async () => {
    // A defence against a loop, not an authorisation check. Refusing every
    // write because the counter is unavailable turns a slow database into an
    // outage — and the authorisation check, RLS, is in that same database.
    rpc.mockRejectedValue(new Error("connection refused"));

    const response = await updateSession(request("/api/expenses", "POST"));
    expect(response.status).toBe(200);
  });

  it("does not count a signed-out caller, who is answered before this", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await updateSession(request("/api/expenses", "POST"));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
