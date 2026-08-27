import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="title-text">HouseOS</p>
          <p className="caption-text text-text-muted">
            The work and the money, both visible.
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
