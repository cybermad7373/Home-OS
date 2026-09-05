import type { Metadata } from "next";
import Link from "next/link";
import { legalContact } from "@/lib/utils/contact";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The terms HouseOS is offered on: what an account may do, what a household owns, and what the software does not promise.",
};

/**
 * The terms of use.
 *
 * Written against the software as built, the same way the privacy page is.
 * Every clause here describes a rule the code actually enforces — household
 * isolation by RLS, a lead's authority over a Home, the fact that money is a
 * record rather than a payment — so nothing on this page is a promise the
 * product cannot keep.
 *
 * What it deliberately does not do is pretend to be a lawyer's document. It has
 * no arbitration clause, no governing-law section and no limitation of
 * liability, because those are decisions for whoever operates this deployment
 * and inventing them here would be worse than leaving them out. The one
 * `Placeholder` marks exactly that.
 */
export default function TermsPage() {
  const contact = legalContact();

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="eyebrow-text">Terms</p>
        <h1 className="title-text">The terms HouseOS is offered on</h1>
        <p className="text-text-muted">
          HouseOS is a shared record of a household. These terms say what an
          account may do with it, who owns what is written in it, and what the
          software does not promise.
        </p>
      </header>

      {contact.configured ? (
        <Section title="Who operates this service">
          <p>
            <Strong>{contact.entity}</Strong>
            {contact.address ? <>, {contact.address}</> : null}.
          </p>
          <p>
            Written questions about these terms go to{" "}
            <a href={`mailto:${contact.email}`} className="underline">
              {contact.email}
            </a>
            .
          </p>
        </Section>
      ) : (
        <Placeholder>
          Before release, set <Code>NEXT_PUBLIC_LEGAL_ENTITY</Code>,{" "}
          <Code>NEXT_PUBLIC_LEGAL_ADDRESS</Code> and{" "}
          <Code>NEXT_PUBLIC_SUPPORT_EMAIL</Code>. This box is replaced by the
          operator&rsquo;s name, its registered address and the address written
          questions go to, on this page and on Support. Everything else here
          describes the software as built and needs no editing.
        </Placeholder>
      )}

      <Section title="An account, and who it belongs to">
        <p>
          <Strong>One account, one person.</Strong> An account is identified by
          a username and an email address, and it is yours. Sharing it with
          somebody else means the household&rsquo;s record credits your name for
          their work and their spending, which is the one thing this product
          exists to get right.
        </p>
        <p>
          <Strong>You are responsible for what your account does.</Strong>{" "}
          Approving an expense, confirming a chore or answering a decision is a
          statement the household relies on and the record keeps permanently.
        </p>
        <p>
          <Strong>A dependent is not an account.</Strong> Somebody added without
          an account of their own — a child, a parent, anybody who lives in the
          home and does not use the app — has no login and cannot answer
          anything. They count as a head when the shopping is split, and their
          share sits with whoever looks after them.
        </p>
      </Section>

      <Section title="Homes, and who decides">
        <p>
          <Strong>Nobody is added to a Home without asking.</Strong> An invite
          link lets somebody request to join. Holding the link grants nothing on
          its own; a lead of that Home has to let them in, and until they do the
          person sees nothing of the Home at all.
        </p>
        <p>
          <Strong>A Home&rsquo;s leads set its rules.</Strong> The rooms, the
          chore list, the categories, the approval thresholds and how decisions
          are made are theirs to set. Where the app requires the Home to agree —
          removing a member, changing a rule, adjusting a settled balance — it
          asks the people affected and records their answers, and no single
          member&rsquo;s answers can complete a Critical decision.
        </p>
        <p>
          <Strong>Leaving a Home does not erase you from it.</Strong> The
          expenses, splits and chores you were part of stay in that
          household&rsquo;s record, because removing them would silently change
          what everybody else owes.
        </p>
      </Section>

      <Section title="What the record is, and is not">
        <p>
          <Strong>HouseOS moves no money.</Strong> It works out who owes whom
          and can hand you a UPI link to pay with. It is not a payment service,
          it holds no funds, and it never confirms that a payment happened — a
          settlement is marked paid because a person said so.
        </p>
        <p>
          <Strong>The figures are a household&rsquo;s own arithmetic.</Strong>{" "}
          Splits, penalties, targets and settlements are computed from what the
          household entered, under the rules the household chose. They are not
          accounting advice and they are not a tax record.
        </p>
        <p>
          <Strong>A closed month is corrected, not rewritten.</Strong> An
          adjustment adds a transfer on top of a settled month and says why. The
          original stays readable.
        </p>
      </Section>

      <Section title="What you may not do">
        <p>
          Use somebody else&rsquo;s account, or try to reach a household you
          were not let into. Household isolation is enforced by the database
          rather than by the screens, and attempts to get round it are logged
          against the account that made them.
        </p>
        <p>
          Upload anything to a shared household record that you do not have the
          right to share, including photographs of other people and documents
          belonging to somebody outside the home.
        </p>
        <p>
          Use the service to harass anybody in your household. A shared ledger
          makes people visible to each other by design; that is not a licence.
        </p>
      </Section>

      <Section title="AI features">
        <p>
          Some screens can call a language model — to read a typed expense, to
          suggest a meal, to draft a schedule. They are optional, and they run
          only when a Home&rsquo;s admin has supplied that Home&rsquo;s own key.
          Without one, every feature falls back to a deterministic path and
          nothing is sent anywhere.
        </p>
        <p>
          When they do run, a model&rsquo;s answer is a suggestion. Nothing it
          proposes takes effect until somebody in the household accepts it, and
          every call is recorded so the Home can see what was asked and what it
          cost.
        </p>
        <p>
          What is sent, and what is never sent, is set out on the{" "}
          <Link href="/legal/privacy" className="underline">
            privacy page
          </Link>
          .
        </p>
      </Section>

      <Section title="Availability, and ending it">
        <p>
          <Strong>The service is offered as it is.</Strong> There is no uptime
          commitment on this deployment, and scheduled jobs — the weekly
          schedule, recurring expenses, reminders — depend on infrastructure
          that can fail.
        </p>
        <p>
          <Strong>You can stop at any time.</Strong> Every screen that shows
          money offers an export, and the whole ledger can be taken as CSV or a
          settlement statement as PDF without a tier, a cap or a waiting period.
          What deletion does and does not currently do is described honestly on
          the{" "}
          <Link href="/legal/privacy" className="underline">
            privacy page
          </Link>
          .
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>
          If these terms change in a way that affects what an account may do,
          the change is announced in the app before it takes effect. Corrections
          that do not change what anybody may do are made in place.
        </p>
      </Section>

      <p className="caption-text text-text-muted">
        See also the{" "}
        <Link href="/legal/privacy" className="underline">
          privacy page
        </Link>{" "}
        and{" "}
        <Link href="/legal/support" className="underline">
          support
        </Link>
        .
      </p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="heading-text">{title}</h2>
      {children}
    </section>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-text">{children}</span>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface px-1 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  );
}

/** Marked, so that shipping it by accident is obvious rather than subtle. */
function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-border-strong bg-surface-2 p-4">
      <p className="eyebrow-text mb-1.5">To be completed before release</p>
      <p className="caption-text text-text-muted">{children}</p>
    </div>
  );
}
