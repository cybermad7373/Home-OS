import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PendingApproval } from "@/components/forms/pending-approval";
import { getMembership, listMemberships, requireSession } from "@/lib/data/house";
import { listOwnJoinRequests } from "@/lib/data/homes";

export const metadata: Metadata = { title: "Waiting to be let in" };

/**
 * The Requested state's home.
 *
 * From phase 10 a person may be Active in one Home and Requested in another,
 * so being here is not the same as having nowhere to go: if any membership is
 * Active, the app is usable and this screen steps out of the way.
 */
export default async function PendingPage() {
  const session = await requireSession();
  const memberships = await listMemberships(session);
  const requests = await listOwnJoinRequests(session);

  if (memberships.some((membership) => membership.member.status === "active")) {
    redirect("/dashboard");
  }

  const membership = await getMembership(session);
  const houseName =
    membership?.house.name ?? requests[0]?.houseName ?? null;

  if (!houseName) redirect("/onboarding/house");

  return (
    <PendingApproval houseName={houseName} memberId={membership?.member.id ?? null} />
  );
}
