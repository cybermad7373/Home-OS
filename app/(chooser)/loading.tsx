import { Skeleton } from "@/components/ui/skeleton";

/**
 * The chooser while it works out which Homes you belong to.
 *
 * This is the first screen after signing in, so it is the one place in the app
 * where a blank pause reads as "the sign-in did not work". Cards in the shape
 * the real ones come in, three across, same as the grid below them.
 */
export default function ChooserLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your homes</span>

      <div className="mb-6 mt-2 flex flex-col gap-2">
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[168px] rounded-[var(--radius-lg)]" />
        ))}
      </div>
    </div>
  );
}
