import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteAccount } from "@/components/account/delete-account";
import { erasureBlockers } from "@/lib/data/account";
import { getOwnProfile, requireSession } from "@/lib/data/house";

export const metadata: Metadata = {
  title: "Your account",
  description:
    "What this app knows about you, what leaving does to it, and how to delete the account.",
};

/**
 * Your account, and the end of it.
 *
 * The privacy page used to say "There is no self-service account deletion. To
 * have an account and its records removed, ask using the contact below." That
 * was honest and it was a gap — the last one on the launch list that was a hole
 * rather than a decision.
 *
 * The screen leads with what deletion keeps rather than with the button,
 * because the reason somebody presses it is usually a belief about what it will
 * remove. An expense they paid is not theirs to withdraw: other people have
 * settled balances against it, and a ledger that changes after settlement is
 * not a ledger. Anybody deleting an account in order to erase that needs to
 * know it before they type their username, not after.
 */
export default async function AccountPage() {
  const session = await requireSession();
  const [profile, blockers] = await Promise.all([
    getOwnProfile(session),
    erasureBlockers(session),
  ]);

  return (
    <>
      <PageHeader
        title="Your account"
        subtitle="What deleting it removes, and what it cannot"
      />

      <div className="flex flex-col gap-6">
        <section className="card-shell p-4">
          <h2 className="mb-2 font-medium">What is deleted</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px] text-text-muted">
            <li>Your name, username, email address, phone number and payment address.</li>
            <li>Your profile picture.</li>
            <li>
              Every way this app can reach you: push subscriptions on every
              device, and your notification settings.
            </li>
            <li>Any request to join a Home that nobody has answered yet.</li>
            <li>Sign-in. The account cannot be used again, and the email address is freed.</li>
          </ul>
        </section>

        <section className="card-shell p-4">
          <h2 className="mb-2 font-medium">What stays, and why</h2>
          <p className="text-[15px] text-text-muted">
            The household ledger. An expense you paid, a share you owed, a
            settlement somebody marked as paid — these stay in the Home&apos;s
            records, with <strong>Former member</strong> where your name was.
            Removing them would change balances other people have already
            settled against, which is the one thing a shared ledger cannot do.
          </p>
          <p className="mt-2 text-[15px] text-text-muted">
            The same is true of chores you completed and decisions you voted on:
            they are part of a record several people rely on, and they no longer
            carry your name.
          </p>
        </section>

        <section className="card-shell p-4">
          <h2 className="mb-3 font-medium">Delete this account</h2>
          <DeleteAccount
            canErase={blockers.length === 0}
            blockers={blockers.map((blocker) => ({
              id: blocker.house_id,
              name: blocker.house_name,
            }))}
            username={profile?.username ?? profile?.display_name ?? ""}
          />
        </section>
      </div>
    </>
  );
}
