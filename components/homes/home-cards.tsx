"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { HomeCard } from "@/lib/data/homes";
import { HOME_TYPE_LABEL } from "@/lib/types/domain";

export function HomeCards({
  homes,
  selectedId,
}: {
  homes: HomeCard[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function select(houseId: string) {
    const response = await fetch("/api/homes/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ house_id: houseId }),
    });
    if (!response.ok) return;
    startTransition(() => {
      router.push("/home");
      router.refresh();
    });
  }

  if (homes.length === 0) {
    return (
      <EmptyState
        title="No homes yet"
        body="Open the invite link somebody sent you, or set up a home of your own."
      />
    );
  }

  return (
    // Homes are objects, not rows: two or three to a line on a desktop rather
    // than one banner each.
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {homes.map((home) => {
        const isSelected = home.id === selectedId;
        const isRequested = home.status === "requested";

        return (
          <li key={home.id}>
            <Card
              className={
                isSelected
                  ? "overflow-hidden border-border-strong pl-4 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary"
                  : isRequested
                    ? "border-dashed"
                    : undefined
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {isSelected ? <p className="eyebrow-text mb-1">Current</p> : null}
                  <CardTitle>{home.name}</CardTitle>
                  <CardDescription>
                    {HOME_TYPE_LABEL[home.homeType]}
                    {isRequested
                      ? " · waiting to be let in"
                      : home.role === "admin"
                        ? " · you are the admin"
                        : home.role === "co_admin"
                          ? " · you are a co-admin"
                          : ""}
                  </CardDescription>
                </div>
                {home.pendingCount > 0 ? (
                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[12px] font-medium text-primary-fg">
                    {home.pendingCount} waiting
                  </span>
                ) : null}
              </div>

              <div className={isSelected ? "" : "mt-3"}>
                {isRequested ? (
                  <p className="caption-text text-text-muted">
                    Nothing to see here until somebody lets you in — not the
                    members, not the money, not the chores.
                  </p>
                ) : isSelected ? null : (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={pending}
                    onClick={() => select(home.id)}
                  >
                    Switch to this home
                  </Button>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
