import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/house/settings-form";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getLlmConfig } from "@/lib/data/llm";

export const metadata: Metadata = { title: "House settings" };

export default async function SettingsPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  // Hiding admin UI is presentation, not security — the API and the RLS policy
  // both refuse a non-admin write regardless of what this page renders.
  if (!context.isAdmin) redirect("/more");

  // Phase 9: the key is the house's own. The environment variable survives as a
  // fallback for a single-house self-host, so either counts as configured.
  const llm = await getLlmConfig(session, context.house.id);

  return (
    <>
      <PageHeader title="House settings" subtitle={context.house.name} />
      <SettingsForm
        settings={context.settings}
        inviteCode={context.house.invite_code}
        currency={context.house.currency}
        llmConfigured={llm.configured || Boolean(process.env.LLM_API_KEY)}
      />
    </>
  );
}
