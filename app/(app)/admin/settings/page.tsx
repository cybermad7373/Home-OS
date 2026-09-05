import type { Metadata } from "next";
import { LeadOnlyPage } from "@/components/ui/lead-only";
import { SettingsForm } from "@/components/house/settings-form";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getLlmConfig } from "@/lib/data/llm";
import { getLiveInvitation, inviteUrl } from "@/lib/data/homes";

export const metadata: Metadata = {
  title: "House settings",
  description: "Penalty rate, thresholds, invite code and how money works here.",
};

export default async function SettingsPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  // Hiding admin UI is presentation, not security — the API and the RLS policy
  // both refuse a non-admin write regardless of what this page renders. What
  // this page owes a member is a sentence, not a redirect to a screen they did
  // not ask for.
  if (!context.isAdmin) {
    return (
      <LeadOnlyPage
        title="House settings"
        what="set the penalty rate, the approval threshold, the invite link and how money works here"
      />
    );
  }

  // Phase 9: the key is the house's own. The environment variable survives as a
  // fallback for a single-house self-host, so either counts as configured.
  const llm = await getLlmConfig(session, context.house.id);
  const invitation = await getLiveInvitation(session, context.house.id);

  return (
    <>
      <PageHeader title="House settings" subtitle={context.house.name} />
      <SettingsForm
        settings={context.settings}
        inviteUrl={invitation ? inviteUrl(invitation.token) : null}
        currency={context.house.currency}
        llmConfigured={llm.configured || Boolean(process.env.LLM_API_KEY)}
      />
    </>
  );
}
