import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingAi } from "@/components/house/onboarding-ai";
import { getMembership, requireSession } from "@/lib/data/house";
import { getLlmConfig } from "@/lib/data/llm";

export const metadata: Metadata = { title: "AI features" };

/**
 * S-06b — the optional AI step of the house wizard.
 *
 * It comes straight after the house is created, while the admin is still in
 * set-up mode and a five-minute detour to a provider console is acceptable.
 * Skipping is the expected path and costs the house nothing but the prose.
 */
export default async function OnboardingAiPage() {
  const session = await requireSession();
  const membership = await getMembership(session);

  if (!membership) redirect("/onboarding/house");
  if (membership.member.status === "requested") redirect("/onboarding/pending");
  // Only the admin who set the house up has anything to do here.
  if (membership.member.role !== "admin") redirect("/onboarding/profile");

  const config = await getLlmConfig(session, membership.house.id);

  return <OnboardingAi initialConfig={config} />;
}
