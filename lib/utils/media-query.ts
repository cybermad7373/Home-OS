"use client";

import { useSyncExternalStore } from "react";

/**
 * A media query, read the way React wants an external store read.
 *
 * The version this replaces started at `false`, then set state inside an
 * effect to the real answer — a synchronous setState in an effect, which is a
 * cascading render and exactly what `useSyncExternalStore` exists to replace.
 * It also meant every consumer rendered once with the wrong answer: on a
 * machine set to "reduce motion", the first frame animated anyway.
 *
 * The server snapshot is `false` for every query. It is the only honest answer
 * — the server has no viewport and no user preferences — and it is the right
 * default for the one query this app asks: nobody's reduced-motion setting is
 * knowable until the client says so.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
