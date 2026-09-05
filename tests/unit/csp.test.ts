import { describe, expect, it } from "vitest";
import {
  contentSecurityPolicy,
  createNonce,
  cspHeaderName,
} from "@/lib/infra/http/csp";

const SUPABASE = "https://foxzpnofcpyeouwnoqjp.supabase.co";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

function policy(overrides: Partial<Parameters<typeof contentSecurityPolicy>[0]> = {}) {
  return contentSecurityPolicy({
    nonce: "TESTNONCE",
    dev: false,
    supabaseUrl: SUPABASE,
    ...overrides,
  });
}

describe("the content security policy", () => {
  it("nonces the scripts and lets nonced scripts load the rest", () => {
    const script = directives(policy()).get("script-src")!;
    expect(script).toContain("'nonce-TESTNONCE'");
    expect(script).toContain("'strict-dynamic'");
    // The point of the whole policy: an injected tag has no nonce and does not
    // run, and no blanket inline escape hatch exists to save it.
    expect(script).not.toContain("'unsafe-inline'");
  });

  it("allows eval in development and never in production", () => {
    expect(directives(policy({ dev: true })).get("script-src")).toContain("'unsafe-eval'");
    expect(directives(policy()).get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("upgrades insecure requests in production only", () => {
    // On a development machine served over plain http this would upgrade every
    // request to a port nothing is listening on.
    expect(policy()).toContain("upgrade-insecure-requests");
    expect(policy({ dev: true })).not.toContain("upgrade-insecure-requests");
  });

  it("lets the browser reach Supabase over both schemes", () => {
    // supabase-js signs in and refreshes tokens from the page, and opens a
    // realtime socket. Without both the app cannot authenticate at all.
    const connect = directives(policy()).get("connect-src")!;
    expect(connect).toContain(SUPABASE);
    expect(connect).toContain("wss://foxzpnofcpyeouwnoqjp.supabase.co");
  });

  it("lets a signed storage URL render as a receipt or an avatar", () => {
    expect(directives(policy()).get("img-src")).toContain(SUPABASE);
  });

  it("adds an analytics origin only when one is configured", () => {
    expect(directives(policy()).get("connect-src")).not.toContain("https://plausible.example");
    expect(
      directives(policy({ analyticsSrc: "https://plausible.example/script.js" })).get(
        "connect-src",
      ),
    ).toContain("https://plausible.example");
  });

  it("drops a malformed origin rather than emitting a broken directive", () => {
    const built = policy({ supabaseUrl: "not-a-url", analyticsSrc: "also-not" });
    expect(built).not.toContain("not-a-url");
    expect(directives(built).get("connect-src")).toEqual(["'self'"]);
  });

  it("forbids framing, plugins and a rewritten base", () => {
    const parsed = directives(policy());
    expect(parsed.get("frame-ancestors")).toEqual(["'none'"]);
    expect(parsed.get("object-src")).toEqual(["'none'"]);
    expect(parsed.get("base-uri")).toEqual(["'self'"]);
    expect(parsed.get("form-action")).toEqual(["'self'"]);
  });

  it("allows inline styles, which is the documented compromise", () => {
    // A `style` attribute cannot carry a nonce, and motion/react appends a
    // style element of its own during a layout animation. See the module
    // comment: script injection is the threat this policy is for.
    expect(directives(policy()).get("style-src")).toContain("'unsafe-inline'");
  });
});

describe("the nonce", () => {
  it("is different every time and long enough to be unguessable", () => {
    const nonces = new Set(Array.from({ length: 100 }, createNonce));
    expect(nonces.size).toBe(100);
    // 16 random bytes, base64.
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("report-only", () => {
  it("is off unless asked for, because a policy nobody switched on is none", () => {
    expect(cspHeaderName(false)).toBe("Content-Security-Policy");
    expect(cspHeaderName(true)).toBe("Content-Security-Policy-Report-Only");
  });
});
