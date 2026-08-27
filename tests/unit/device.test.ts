import { describe, expect, it } from "vitest";
import { deviceLabel, lastSeenLabel } from "@/lib/utils/device";

/**
 * The device list is the whole of "where does the house reach me" now that
 * push is the only channel that leaves the app. A member removes a device by
 * recognising it, so a label that says "Safari" for an Android phone is not a
 * cosmetic defect — it is the wrong device removed.
 *
 * The strings below are real user agents, which is the only kind worth testing:
 * every browser lies about being every other browser, and the order the
 * patterns are tried in is the whole of the logic.
 */

const AGENTS = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
  samsung:
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
} as const;

describe("deviceLabel", () => {
  it("names the browser and the machine it runs on", () => {
    expect(deviceLabel(AGENTS.androidChrome, "web")).toBe("Chrome on Android");
    expect(deviceLabel(AGENTS.iphoneSafari, "web")).toBe("Safari on iPhone");
    expect(deviceLabel(AGENTS.macFirefox, "web")).toBe("Firefox on Mac");
  });

  it("believes the browser that claims to be several", () => {
    // Edge says Chrome and Safari before it says Edg; Samsung Internet says
    // Chrome. Taking the first match in the string rather than in the table
    // would label both of these "Chrome".
    expect(deviceLabel(AGENTS.windowsEdge, "web")).toBe("Edge on Windows");
    expect(deviceLabel(AGENTS.samsung, "web")).toBe("Samsung Internet on Android");
  });

  it("calls a native registration an app, not a browser", () => {
    // The app registers through the same VAPID key as the browser, so the
    // user agent it sends is not evidence of anything. The platform is.
    expect(deviceLabel(AGENTS.androidChrome, "android")).toBe("Android app");
    expect(deviceLabel(AGENTS.iphoneSafari, "ios")).toBe("iPhone app");
    expect(deviceLabel(null, "android")).toBe("Android app");
  });

  it("says something rather than nothing when it cannot tell", () => {
    expect(deviceLabel(null, "web")).toBe("Web browser");
    expect(deviceLabel("curl/8.4.0", "web")).toBe("Web browser");
  });
});

describe("lastSeenLabel", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("answers in the unit a person would use", () => {
    expect(lastSeenLabel(ago(30_000), now)).toBe("Just now");
    expect(lastSeenLabel(ago(20 * 60_000), now)).toBe("20 minutes ago");
    expect(lastSeenLabel(ago(60 * 60_000), now)).toBe("An hour ago");
    expect(lastSeenLabel(ago(5 * 60 * 60_000), now)).toBe("5 hours ago");
    expect(lastSeenLabel(ago(24 * 60 * 60_000), now)).toBe("Yesterday");
    expect(lastSeenLabel(ago(9 * 24 * 60 * 60_000), now)).toBe("9 days ago");
    expect(lastSeenLabel(ago(70 * 24 * 60 * 60_000), now)).toBe("2 months ago");
  });

  it("does not travel backwards when a device clock is ahead", () => {
    // The timestamp is written by Postgres, but the comparison happens in the
    // browser, whose clock is whatever the owner set it to.
    expect(lastSeenLabel(ago(-90 * 60_000), now)).toBe("Just now");
  });
});
