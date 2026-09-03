"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface HomeOption {
  id: string;
  name: string;
  homeType: "shared" | "family";
  pendingCount: number;
}

/**
 * The Home switcher.
 *
 * Switching is a server call, not a client route change, because the selected
 * Home is server-side session state (docs/05-API-SPEC.md section 1). The
 * refresh afterwards is what re-renders every screen against the new Home; the
 * component itself holds no Home data.
 */
export function HomeSwitcher({
  homes,
  selectedId,
  className,
}: {
  homes: HomeOption[];
  selectedId: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const selected = homes.find((home) => home.id === selectedId) ?? homes[0];

  async function select(houseId: string) {
    setOpen(false);
    if (houseId === selectedId) return;

    const response = await fetch("/api/homes/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ house_id: houseId }),
    });
    if (!response.ok) return;

    startTransition(() => {
      router.refresh();
    });
  }

  // One Home and nothing waiting: a switcher would be a control with nothing
  // to switch to, so it renders as the name it already was.
  if (homes.length < 2) {
    return (
      <p className={cn("heading-text truncate", className)}>{selected?.name ?? "Home"}</p>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={pending}
        className="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 text-left hover:bg-surface-2"
      >
        <span className="heading-text truncate">{selected?.name}</span>
        <ChevronDown size={16} aria-hidden className="shrink-0 text-text-muted" />
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-[0_8px_24px_rgb(0_0_0/0.12)]"
        >
          {homes.map((home) => (
            <li key={home.id}>
              <button
                type="button"
                role="option"
                aria-selected={home.id === selectedId}
                onClick={() => select(home.id)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[15px] hover:bg-surface-2"
              >
                <Check
                  size={16}
                  aria-hidden
                  className={cn(
                    "shrink-0",
                    home.id === selectedId ? "text-primary" : "invisible",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{home.name}</span>
                {home.pendingCount > 0 ? (
                  <span className="shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-fg">
                    {home.pendingCount}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          <li className="border-t border-border">
            <Link
              href="/homes"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-[15px] text-text-muted hover:bg-surface-2"
            >
              <Plus size={16} aria-hidden className="shrink-0" />
              My homes
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
