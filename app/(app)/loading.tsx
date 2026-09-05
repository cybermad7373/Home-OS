import { Skeleton } from "@/components/ui/skeleton";

/**
 * What every screen in the shell shows while its data is on the way.
 *
 * There was no `loading.tsx` anywhere in this app, which on a server-rendered
 * product means a navigation shows the *previous* screen until the next one is
 * ready. On a household ledger that is worse than a blank page: you tap Money,
 * keep looking at Chores for a second, and cannot tell whether the tap
 * registered — so you tap again.
 *
 * One file covers the whole shell, because every screen in it is the same
 * shape: a title, a subtitle, and a column of blocks. It deliberately does not
 * try to imitate each screen's own layout — a skeleton that guesses wrong
 * shifts the page twice instead of once.
 *
 * The header, sidebar and tab bar are rendered by the layout above this and do
 * not flicker: they are already on screen and they stay there, which is the
 * whole reason this belongs at the shell level rather than in each route.
 */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-[var(--radius-lg)]" />
        <Skeleton className="h-28 rounded-[var(--radius-lg)]" />
      </div>

      <div className="mt-8 flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-16 rounded-[var(--radius-lg)]" />
        <Skeleton className="h-16 rounded-[var(--radius-lg)]" />
        <Skeleton className="h-16 rounded-[var(--radius-lg)]" />
      </div>
    </div>
  );
}
