import type { Metadata } from "next";
import Link from "next/link";
import { legalContact } from "@/lib/utils/contact";

export const metadata: Metadata = {
  title: "Support",
  description: "How to get help with HouseOS, and answers to the things households ask first.",
};

/**
 * The support page.
 *
 * Two jobs: give a person somewhere to write to, and answer the questions that
 * otherwise become that letter. The answers are the product's actual rules —
 * each one is a decision recorded in DECISIONS.md — rather than reassurance,
 * because the questions households ask first are mostly "why did it do that",
 * and the honest answer is usually "on purpose, and here is the reason".
 */
export default function SupportPage() {
  const contact = legalContact();

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="eyebrow-text">Support</p>
        <h1 className="title-text">Getting help</h1>
        <p className="text-text-muted">
          What to do when something is wrong, and answers to what households ask
          first.
        </p>
      </header>

      {contact.configured ? (
        <Section title="Where to write">
          <p>
            <a href={`mailto:${contact.email}`} className="underline">
              {contact.email}
            </a>
          </p>
          <p>
            {contact.entity}
            {contact.address ? <>, {contact.address}</> : null}.
          </p>
          <p className="caption-text text-text-muted">
            One inbox, read by people rather than by a queue. Say which
            household and which screen, and include the date — the answers below
            explain why both matter.
          </p>
        </Section>
      ) : (
        <Placeholder>
          Before release, set <Code>NEXT_PUBLIC_SUPPORT_EMAIL</Code>,{" "}
          <Code>NEXT_PUBLIC_LEGAL_ENTITY</Code> and{" "}
          <Code>NEXT_PUBLIC_LEGAL_ADDRESS</Code>. This box is replaced by the
          address to write to and who is behind it, here and on the terms page.
        </Placeholder>
      )}

      <Section title="Before you write">
        <p>
          <Strong>Say which household and which screen.</Strong> Most of what
          looks like a bug is a household set up differently from the one you
          expect: a home that shares one pot behaves differently from one that
          splits every expense, and a home that runs a rota behaves differently
          from one that scores effort in points.
        </p>
        <p>
          <Strong>Include the date.</Strong> Money and chores are evaluated in
          your household&apos;s own timezone, so &ldquo;yesterday&rdquo; is
          ambiguous and a date is not.
        </p>
      </Section>

      <Section title="Things that look wrong and are not">
        <Question q="I paid for something and the app says I owe money.">
          In a household that splits expenses, what you owe is your share of
          everything minus what you have paid. Paying for one thing does not
          clear a share of everything else. In a household that shares a pot,
          you are never told you owe anything at all — the screens show your
          share and what you paid of it.
        </Question>

        <Question q="I marked a chore done and got no points.">
          Points post when somebody else confirms the work, not when you say it
          is done. How many confirmations are needed depends on the size of the
          household. You can never confirm your own chore, and a guardian can
          mark a dependant&apos;s chore done without being able to confirm it.
        </Question>

        <Question q="Nobody can close the month.">
          Closing is refused while an expense is still waiting for approval, or
          while the balances do not net to zero. Both refusals name what is
          blocking them. Closing is also a decision the household makes
          together, so one administrator asking is the start of it rather than
          the end.
        </Question>

        <Question q="An administrator cannot remove a member.">
          Correct, and deliberately. Ending somebody&apos;s membership is a
          decision the household takes, not one person&apos;s. If the member has
          money outstanding, the removal waits until the last payment is
          confirmed.
        </Question>

        <Question q="The AI features do nothing.">
          They need a provider key, which your household supplies and which an
          administrator can add in settings. Each of the six uses has its own
          switch. Anything switched off, or a key that is missing, behaves
          exactly as if the feature had never existed — the screen shows its
          ordinary version, with no error and no upsell.
        </Question>

        <Question q="A dish appears twice under two spellings.">
          The app offers a match rather than merging on its own, because a
          duplicate can be merged later and a merge cannot be unpicked. An
          administrator or co-administrator can merge two library entries, and
          the history keeps both original names.
        </Question>

        <Question q="I am not getting notifications.">
          Check that the browser has permission, and that the notification type
          is on in house settings. Notifications need the app installed or the
          site open at least once on that device, and a device that has not been
          used for a long time may have had its subscription expired by the
          browser&apos;s push service.
        </Question>
      </Section>

      <Section title="Getting your records out">
        <p>
          Insights exports your household&apos;s records as CSV and a settlement
          statement as PDF. There is no tier, no cap and no waiting period, and
          you do not need to ask us.
        </p>
      </Section>

      <Section title="Something is broken">
        <p>
          Say what you did, what you expected, and what happened instead, and
          include the household and the date. If a figure is wrong, the most
          useful thing you can send is the figure you expected and how you
          worked it out.
        </p>
        <p>
          For what is stored and who can read it, see{" "}
          <Link href="/legal/privacy" className="underline">Privacy</Link>.
        </p>
      </Section>
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

function Question({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-l-2 border-border pl-4">
      <p className="font-medium text-text">{q}</p>
      <p className="text-text-muted">{children}</p>
    </div>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-text">{children}</span>;
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-border-strong bg-surface-2 p-4">
      <p className="eyebrow-text mb-1.5">To be completed before release</p>
      <p className="caption-text text-text-muted">{children}</p>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface px-1 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  );
}
