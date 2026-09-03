"use client";

import { useRouter } from "next/navigation";
import { AiSettings, type AiConfig } from "@/components/house/ai-settings";

/**
 * The wizard's wrapper around the AI panel: same panel, but skipping and saving
 * both continue to the next step rather than staying put.
 */
export function OnboardingAi({ initialConfig }: { initialConfig: AiConfig }) {
  const router = useRouter();
  const next = () => {
    router.push("/onboarding/profile");
    router.refresh();
  };

  return (
    <>
      {/* The panel no longer carries the title — the admin screen's page header
          does — so the wizard, which has no header, supplies its own. */}
      <h1 className="title-text mb-4">AI features</h1>
      <AiSettings
        initialConfig={initialConfig}
        onSkip={next}
        onSaved={next}
        skipLabel="Skip — set it up later"
      />
    </>
  );
}
