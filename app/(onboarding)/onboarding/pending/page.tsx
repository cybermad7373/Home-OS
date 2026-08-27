import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PendingApproval } from "@/components/forms/pending-approval";
import { getMembership, requireSession } from "@/lib/data/house";

export const metadata: Metadata = { title: "Waiting for approval" };

export default async function PendingPage() {
  const session = await requireSession();
  const membership = await getMembership(session);

  if (!membership) redirect("/onboarding/house");
  if (membership.member.status === "active") redirect("/dashboard");

  return (
    <PendingApproval houseName={membership.house.name} memberId={membership.member.id} />
  );
}
