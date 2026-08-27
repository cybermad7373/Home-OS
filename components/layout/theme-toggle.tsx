"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark" | "system";

const EVENT = "houseos-theme-change";

/**
 * The document element is the source of truth for the theme — the inline script
 * in the root layout has already stamped it before React runs. Reading it
 * through `useSyncExternalStore` keeps the button in step with it without a
 * second copy of the state to fall out of sync.
 */
function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function getSnapshot(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  return value === "dark" || value === "light" ? value : "system";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  try {
    if (theme === "system") {
      root.removeAttribute("data-theme");
      localStorage.removeItem("houseos-theme");
    } else {
      root.setAttribute("data-theme", theme);
      localStorage.setItem("houseos-theme", theme);
    }
  } catch {
    // Private browsing can refuse storage. The attribute still applies for this
    // session, which is the part the viewer can see.
  }
  window.dispatchEvent(new Event(EVENT));
}

const LABELS: Record<Theme, string> = {
  system: "Theme: system",
  dark: "Theme: dark",
  light: "Theme: light",
};

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "system" as Theme);
  const next: Theme = theme === "system" ? "dark" : theme === "dark" ? "light" : "system";

  return (
    <Button variant="outline" size="sm" onClick={() => apply(next)}>
      {LABELS[theme]}
    </Button>
  );
}
