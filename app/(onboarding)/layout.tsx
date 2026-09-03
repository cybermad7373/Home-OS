import type { ReactNode } from "react";

/**
 * Onboarding sits between the sign-in screen and the app, and until 3.0 it
 * looked like neither: a bare column on the page ground, with no wordmark and
 * nothing to say which product had just been joined. It carries the auth
 * screen's ground and mark now, quietly — no display headline, because at this
 * point the person is answering questions rather than being introduced to
 * anything.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <main className="dot-grid min-h-dvh px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <p className="mb-6 flex items-center gap-2">
          <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="eyebrow-text text-text">HouseOS</span>
        </p>
        {children}
      </div>
    </main>
  );
}
