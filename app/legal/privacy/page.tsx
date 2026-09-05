import type { Metadata } from "next";
import Link from "next/link";
import { legalContact } from "@/lib/utils/contact";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What HouseOS stores, who can see it, what leaves the app, and what is not built yet.",
};

/**
 * The privacy statement.
 *
 * Every claim here is checked against the code rather than written from a
 * template, and the section that matters most is the last one: the things this
 * product does *not* do yet. A privacy page that describes a deletion flow
 * nobody built is worse than no page at all, so the gaps are named.
 *
 * The dates and the contact address are the two things a person has to supply.
 * They are marked, and they are the only marked things on the page.
 */
export default function PrivacyPage() {
  const contact = legalContact();

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="eyebrow-text">Privacy</p>
        <h1 className="title-text">What HouseOS does with your data</h1>
        <p className="text-text-muted">
          HouseOS is a shared record of a household — what it spent, who did which
          chores, what it ate, and what it decided. This page says what is stored,
          who can read it, what leaves the app, and what is not built yet.
        </p>
      </header>

      {contact.configured ? (
        <Section title="Who holds this data">
          <p>
            <Strong>{contact.entity}</Strong>
            {contact.address ? <>, {contact.address}</> : null}.
          </p>
          <p>
            Questions about what is stored, and requests to see or remove it, go
            to{" "}
            <a href={`mailto:${contact.email}`} className="underline">
              {contact.email}
            </a>
            . What removal currently does, and does not do, is at the foot of
            this page.
          </p>
        </Section>
      ) : (
        <Placeholder>
          Before release, set <Code>NEXT_PUBLIC_LEGAL_ENTITY</Code>,{" "}
          <Code>NEXT_PUBLIC_LEGAL_ADDRESS</Code> and{" "}
          <Code>NEXT_PUBLIC_SUPPORT_EMAIL</Code>. This box is replaced by the
          operator&rsquo;s name, its address and where data questions go.
          Everything else on this page describes the software as built and does
          not need editing.
        </Placeholder>
      )}

      <Section title="What is stored">
        <p>
          <Strong>Your account.</Strong> An email address and a password, or a
          Google sign-in. A username you choose, a display name, and optionally
          an avatar.
        </p>
        <p>
          <Strong>What your household records.</Strong> Expenses and how they
          were split, chores and who did them, meals and what they cost, guests,
          days you are away, announcements, house rules, and the decisions the
          household voted on. Photographs of receipts and of completed chores,
          if anybody attaches them.
        </p>
        <p>
          <Strong>Notification settings.</Strong> If you turn on push
          notifications, the browser gives HouseOS a subscription for that
          device. It is stored so the app can reach you and is removed when you
          turn notifications off.
        </p>
        <p>
          <Strong>An AI provider key, if your household adds one.</Strong> It
          belongs to the household, not to HouseOS, and it is encrypted before it
          is stored. See <em>Artificial intelligence</em> below.
        </p>
      </Section>

      <Section title="Who can see it">
        <p>
          <Strong>Everyone in your household.</Strong> This is the point of the
          product and it is worth being blunt about: a household ledger is
          shared. Every active member can see every expense, every chore, every
          meal and every balance, including yours. There is no per-member privacy
          inside a household.
        </p>
        <p>
          <Strong>Nobody in any other household.</Strong> Separation is enforced
          by the database itself through row-level security, not by application
          code that could forget. Every household-scoped table carries a policy,
          and there is an automated test that tries to read across households and
          asserts that it fails.
        </p>
        <p>
          <Strong>Not other members&apos; email addresses.</Strong> Signing in by
          username never exposes the address behind it; that lookup happens only
          on the server.
        </p>
      </Section>

      <Section title="Artificial intelligence">
        <p>
          HouseOS can use a language model for six things: proposing a chore
          schedule, writing a weekly summary, reading a typed sentence like
          &ldquo;paid 840 for vegetables yesterday&rdquo;, reading a house rule
          written in plain words, suggesting meal ideas, and spotting when a dish
          you typed is one the household already records under another spelling.
        </p>
        <p>
          <Strong>The key is your household&apos;s.</Strong> There is no
          shared HouseOS AI account. A household that wants these features
          supplies its own provider key, and the key is encrypted with
          AES-GCM before it is stored. An administrator can switch each of the
          six off independently; one that is off behaves exactly as if no key
          existed.
        </p>
        <p>
          <Strong>What is sent is restricted, and the restriction is
          tested.</Strong> A model may receive first names, opaque member
          identifiers, chore names, points, dates, dish names and aggregate
          totals. It is never sent email addresses, phone numbers, payment
          identifiers, surnames, database identifiers, individual expense
          descriptions, your household&apos;s name or its address. The two
          deliberate exceptions are text you typed on purpose for the model to
          read — a rule, or a sentence describing an expense — which you see
          before it is sent.
        </p>
        <p>
          <Strong>A model is never the last word.</Strong> Every answer is
          checked on our side before anything is shown or written, and a failed
          check discards the answer rather than repairing it. Nothing a model
          returns is saved to your household without a person confirming it.
        </p>
      </Section>

      <Section title="What leaves the app">
        <p>
          Your data is stored with Supabase, which hosts the database and the
          files. If your household has enabled AI features, the restricted
          payloads described above go to the provider whose key it supplied.
        </p>
        <p>
          Push notifications travel through the push service your browser uses —
          Google&apos;s for Chrome, Mozilla&apos;s for Firefox, Apple&apos;s for
          Safari. Their contents are encrypted so that only your device can read
          them.
        </p>
        <p>There is no advertising, no analytics tracker, and no data broker.</p>
      </Section>

      <Section title="What you can do now">
        <p>
          <Strong>Export everything.</Strong> Insights offers your household&apos;s
          records as CSV and a settlement statement as PDF, with no tier, no cap
          and no waiting period.
        </p>
        <p>
          <Strong>Leave a household.</Strong> Ending a membership is a decision
          the household makes together rather than something one administrator
          does to you. If money is outstanding, the removal completes when the
          last payment is confirmed.
        </p>
        <p>
          <Strong>Turn off notifications</Strong> per type, or entirely, in house
          settings.
        </p>
        <p>
          <Strong>Delete your account,</Strong> from Your account under More.
          Your name, username, email address, phone number, payment address and
          picture are erased; every way the app can reach you is removed; and
          sign-in stops working, freeing the email address for a new account.
          What stays is the household ledger, with{" "}
          <Strong>Former member</Strong> where your name was — see below for
          why. Deleting is possible once you are no longer an active member of
          any household, because leaving one is a decision that household makes.
        </p>
      </Section>

      <Section title="What is not built yet">
        <p>
          These are named rather than glossed over, because a privacy page that
          describes something that does not exist is the worst kind.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <Strong>There is no automatic retention limit.</Strong> A
            household&apos;s records are kept until somebody removes them. Old
            expenses and chores are not aged out.
          </li>
          <li>
            <Strong>Leaving a household does not erase what you recorded.</Strong>{" "}
            An expense you paid stays in that household&apos;s ledger, because
            removing it would change balances other people have already settled
            against.
          </li>
        </ul>
      </Section>

      <Section title="Contact">
        <Placeholder>
          Before release, replace this box with the address a person should write
          to about their data, and the response time you are willing to commit
          to.
        </Placeholder>
        <p>
          For anything else, see <Link href="/legal/support" className="underline">Support</Link>.
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

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-text">{children}</span>;
}

/**
 * The only editable things on the page, and they are marked so that shipping
 * one by accident is obvious rather than subtle.
 */
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
