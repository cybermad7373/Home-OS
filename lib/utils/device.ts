/**
 * Naming a registered device.
 *
 * The settings screen lists every device push can reach, and a list of
 * endpoints is not a list a person can act on: removing the right one requires
 * recognising it. A user agent string is the only description a browser gives
 * us, so this turns it into the two facts that identify a device to its
 * owner — what it is and what it runs.
 *
 * Deliberately shallow. User-agent parsing is a bottomless pit and the cost of
 * being wrong here is a device labelled "Web browser" next to a last-seen date,
 * which is still enough to pick it out. It is never used for behaviour, only
 * for display.
 */

export type DevicePlatform = "web" | "android" | "ios";

const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  // Order matters: every one of these also claims to be Safari or Chrome.
  [/Edg[A-Z]?\//, "Edge"],
  [/OPR\//, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/CriOS\/|Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/Windows NT/, "Windows"],
  [/Android/, "Android"],
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

function match(userAgent: string, table: ReadonlyArray<[RegExp, string]>): string | null {
  for (const [pattern, name] of table) {
    if (pattern.test(userAgent)) return name;
  }
  return null;
}

/**
 * A short human label: "Chrome on Android", "Android app", "Safari on iPhone".
 *
 * The native platforms are named as apps rather than browsers, because that is
 * what they are — an Android build registers through the same VAPID key, and
 * calling it "Chrome on Android" would be a guess dressed as a fact.
 */
export function deviceLabel(userAgent: string | null, platform: DevicePlatform): string {
  if (platform === "android") return "Android app";
  if (platform === "ios") return "iPhone app";

  if (!userAgent) return "Web browser";

  const browser = match(userAgent, BROWSERS);
  const system = match(userAgent, SYSTEMS);

  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Web browser";
}

/** "Just now", "2 hours ago", "3 days ago" — a date is not what is being asked. */
export function lastSeenLabel(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));

  if (seconds < 90) return "Just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes ago`;

  const hours = Math.round(seconds / 3600);
  if (hours < 24) return hours === 1 ? "An hour ago" : `${hours} hours ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "Yesterday" : `${days} days ago`;

  const months = Math.round(days / 30);
  return months === 1 ? "A month ago" : `${months} months ago`;
}
