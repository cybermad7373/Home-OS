import type { ReactNode } from "react";

/**
 * The first screen anybody sees, and the only place the product introduces
 * itself.
 *
 * It was a centred title and a line of grey text on a blank page — correct,
 * and indistinguishable from a half-built prototype. The dot grid behind it is
 * the same one the empty states use, the wordmark is set in the technical
 * label, and the live dot is the one place besides an urgent count where the
 * accent red is spent. Nothing here is decoration for its own sake: it is the
 * design system's own vocabulary, on the screen that has to establish it.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="dot-grid flex min-h-dvh flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8">
          <p className="flex items-center gap-2">
            <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="eyebrow-text text-text">HouseOS</span>
          </p>
          <p className="display-xl mt-3 leading-[1.05]">
            The work
            <br />
            and the money,
            <br />
            both visible.
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
