import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClaimUsername } from "@/components/forms/claim-username";
import { requireSession } from "@/lib/data/house";

export const metadata: Metadata = { title: "Pick a username" };

/** Suggests a name from the email local part, cleaned to the allowed shape. */
function suggest(email: string | null, displayName: string | null): string {
  const source = (email?.split("@")[0] ?? displayName ?? "").replace(/[^A-Za-z0-9_]/g, "");
  const trimmed = source.slice(0, 20);
  return /^[A-Za-z]/.test(trimmed) ? trimmed : `house_${trimmed}`.slice(0, 20);
}

export default async function UsernamePage() {
  const session = await requireSession();

  const { data: profile } = await session.supabase
    .from("users")
    .select("username, email, display_name")
    .eq("id", session.userId)
    .maybeSingle();

  if (profile?.username) redirect("/onboarding/house");

  return (
    <ClaimUsername
      suggestion={suggest(profile?.email ?? null, profile?.display_name ?? null)}
    />
  );
}
