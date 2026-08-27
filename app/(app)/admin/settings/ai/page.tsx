import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AiSettings } from "@/components/house/ai-settings";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getLlmConfig } from "@/lib/data/llm";

export const metadata: Metadata = { title: "AI features" };

/**
 * The same panel as onboarding's, for later entry, replacement or removal.
 *
 * Hiding it from a non-admin is presentation, not security: `PUT` and `DELETE`
 * are refused by the route and again by `set_house_llm_credential`, which
 * checks the caller is an admin of that house in the database.
 */
export default async function AiSettingsPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  if (!context.isAdmin) redirect("/more");

  const config = await getLlmConfig(session, context.house.id);

  return (
    <>
      <PageHeader title="AI features" subtitle={context.house.name} />
      <AiSettings initialConfig={config} />
    </>
  );
}
