/**
 * Landing page at /.
 *
 * Editorial single-scroll marketing surface. Same design tokens as the app
 * (Cloud Dancer + Muted Terracotta, Lora + Inter + Geist Mono). Copy comes
 * from the Day 6 spec's three-defense framing.
 *
 * Sections: Hero → Three defenses → How it works → Throughline vs Claude
 * table → Pricing → Closing CTA → Footer.
 *
 * All CTAs route to /sign-up. Stripe wiring lands Day 7.
 */

import Link from 'next/link';

interface DefenseCardProps {
  eyebrow: string;
  claim: string;
  body: string;
}

function DefenseCard({ eyebrow, claim, body }: DefenseCardProps) {
  return (
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-8">
      <p className="t-eyebrow text-[var(--color-accent)]">{eyebrow}</p>
      <h3 className="t-display-3 mt-4 text-[var(--color-text-primary)]">{claim}</h3>
      <p className="t-body-m mt-4 text-[var(--color-text-secondary)]">{body}</p>
    </div>
  );
}

interface StepProps {
  step: string;
  title: string;
  body: string;
}

function Step({ step, title, body }: StepProps) {
  return (
    <div>
      <p className="t-eyebrow text-[var(--color-text-tertiary)]">{step}</p>
      <h3 className="t-display-3 mt-3 text-[var(--color-text-primary)]">{title}</h3>
      <p className="t-body-l mt-3 text-[var(--color-text-secondary)]">{body}</p>
    </div>
  );
}

interface PricingCardProps {
  tier: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  emphasized?: boolean;
}

function PricingCard({
  tier,
  price,
  cadence,
  tagline,
  features,
  emphasized,
}: PricingCardProps) {
  return (
    <div
      className={`rounded-lg border p-8 ${
        emphasized
          ? 'border-[var(--color-accent)] bg-[var(--color-bg-surface)]'
          : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)]'
      }`}
    >
      <p className="t-eyebrow text-[var(--color-text-secondary)]">{tier}</p>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="t-display-number text-[var(--color-text-primary)]">{price}</span>
        <span className="t-body-m text-[var(--color-text-tertiary)]">{cadence}</span>
      </p>
      <p className="t-body-m mt-2 text-[var(--color-text-secondary)]">{tagline}</p>
      <ul className="mt-6 space-y-3">
        {features.map((feat) => (
          <li key={feat} className="t-body-m flex gap-3 text-[var(--color-text-primary)]">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-accent)]" />
            {feat}
          </li>
        ))}
      </ul>
      <Link
        href="/sign-up"
        className={`t-body-m mt-8 inline-flex w-full items-center justify-center rounded-md px-5 py-3 transition-colors duration-200 ${
          emphasized
            ? 'cta-hover bg-[var(--color-accent)] text-[var(--color-bg-base)] hover:bg-[var(--color-accent-hover)]'
            : 'border border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-subtle)]'
        }`}
      >
        Start 21-day trial
      </Link>
      <p className="t-code mt-3 text-center text-[var(--color-text-tertiary)]">
        No credit card required
      </p>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="pb-24">
      {/* ------------------------------------------------------------- Hero */}
      <section className="mx-auto max-w-3xl px-6 pt-24 pb-20 sm:pt-32">
        <p className="t-eyebrow text-[var(--color-accent)]">
          For solo PMs, UX researchers, and indie founders
        </p>

        <h1 className="t-display-1 mt-6 text-[var(--color-text-primary)]">
          Verifiable themes across every interview. Stored forever.
        </h1>

        <p className="t-subhead mt-6 max-w-2xl text-[var(--color-text-secondary)]">
          Throughline turns interview transcripts into deduplicated cross-study themes with
          quotes you can trust. Upload a file, get grounded findings. Come back in three months,
          they are still there.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/sign-up"
            className="t-body-m cta-hover rounded-md bg-[var(--color-accent)] px-5 py-3 text-[var(--color-bg-base)] transition-colors duration-200 hover:bg-[var(--color-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Start 21-day trial
          </Link>
          <Link
            href="/sign-in"
            className="t-body-m text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            Sign in →
          </Link>
        </div>

        <p className="t-code mt-6 text-[var(--color-text-tertiary)]">
          No credit card required. Cancel anytime.
        </p>
      </section>

      {/* -------------------------------------------------- Three defenses */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <p className="t-eyebrow text-[var(--color-text-secondary)]">Three defenses</p>
        <h2 className="t-display-2 mt-4 max-w-2xl text-[var(--color-text-primary)]">
          What Throughline does that pasting a transcript into Claude cannot.
        </h2>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <DefenseCard
            eyebrow="Verifiable quotes"
            claim="Every quote is a real transcript substring."
            body="Throughline structurally cannot ship a hallucinated quote. If the model fabricates one, our validator drops it before it reaches you."
          />
          <DefenseCard
            eyebrow="Cross-interview dedup"
            claim="Themes across 25 interviews, one click."
            body="Dedup happens server-side with frequency counts and source refs. Claude cannot fit that many transcripts in one call. Throughline does the plumbing."
          />
          <DefenseCard
            eyebrow="Persistent research"
            claim="A database of your findings, not a chat log."
            body="Every study lives forever. Revisit a three-month-old study and see the same output. Upload a 26th interview and re-synthesize with one click."
          />
        </div>
      </section>

      {/* ----------------------------------------------------- How it works */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <p className="t-eyebrow text-[var(--color-text-secondary)]">How it works</p>
        <h2 className="t-display-2 mt-4 text-[var(--color-text-primary)]">
          Three steps. No tagging, no taxonomies, no setup tax.
        </h2>

        <div className="mt-12 space-y-12">
          <Step
            step="Step 1"
            title="Upload"
            body="Drop a .txt transcript into your study. VTT, SRT, and DOCX come next. No tag tree to set up, no project structure to invent."
          />
          <Step
            step="Step 2"
            title="Analyze"
            body="Each interview returns themes, verbatim quotes, and sentiment in about 30 seconds. Every quote is checked against the transcript before it reaches you."
          />
          <Step
            step="Step 3"
            title="Synthesize"
            body="Click Synthesize once you have three or more interviews. Themes get merged across the study with frequency counts and links back to the source quotes."
          />
        </div>
      </section>

      {/* -------------------------------------------- Throughline vs Claude */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <p className="t-eyebrow text-[var(--color-text-secondary)]">Throughline vs Claude alone</p>
        <h2 className="t-display-2 mt-4 text-[var(--color-text-primary)]">
          Purpose-built beats general purpose for this job.
        </h2>
        <p className="t-body-l mt-4 max-w-2xl text-[var(--color-text-secondary)]">
          Claude is excellent for freeform follow-ups. Throughline is what you use when you need
          the output to be trustworthy, structured, and still there next quarter.
        </p>

        <div className="mt-12 overflow-hidden rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)]">
                <th className="t-eyebrow px-6 py-4 text-left text-[var(--color-text-tertiary)]">
                  &nbsp;
                </th>
                <th className="t-eyebrow px-6 py-4 text-left text-[var(--color-text-primary)]">
                  Throughline
                </th>
                <th className="t-eyebrow px-6 py-4 text-left text-[var(--color-text-tertiary)]">
                  Claude alone
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {[
                {
                  row: 'Verbatim quotes',
                  ours: 'Guaranteed. Validator drops any hallucination.',
                  theirs: 'Sometimes fabricated.',
                },
                {
                  row: 'Cross-interview dedup',
                  ours: '25 interviews, one call.',
                  theirs: 'Does not fit in context.',
                },
                {
                  row: 'Persistence',
                  ours: 'Every study, indexed forever.',
                  theirs: 'Ephemeral conversation.',
                },
                {
                  row: 'Workflow',
                  ours: 'Purpose-built research repo.',
                  theirs: 'General chat window.',
                },
                {
                  row: 'Price',
                  ours: '$19/mo Solo.',
                  theirs: '$20/mo Claude Pro.',
                },
              ].map((r) => (
                <tr key={r.row}>
                  <td className="t-body-m px-6 py-4 text-[var(--color-text-secondary)]">
                    {r.row}
                  </td>
                  <td className="t-body-m px-6 py-4 text-[var(--color-text-primary)]">{r.ours}</td>
                  <td className="t-body-m px-6 py-4 text-[var(--color-text-tertiary)]">
                    {r.theirs}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------------------------------------------------- Pricing */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <p className="t-eyebrow text-[var(--color-text-secondary)]">Pricing</p>
        <h2 className="t-display-2 mt-4 text-[var(--color-text-primary)]">
          Priced for the actual person doing the work.
        </h2>
        <p className="t-body-l mt-4 max-w-2xl text-[var(--color-text-secondary)]">
          You are the researcher, the PM, the founder, and the one who fills in the spreadsheet
          at midnight. The pricing reflects that.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <PricingCard
            tier="Solo"
            price="$19"
            cadence="/ month"
            tagline="For solo researchers, indie PMs, and founders doing customer discovery."
            features={[
              '3 active studies',
              '25 interviews per study',
              'Cross-study synthesis',
              'Every quote verified verbatim',
              '21-day free trial',
            ]}
            emphasized
          />
          <PricingCard
            tier="Pro"
            price="$39"
            cadence="/ month"
            tagline="For PMs and researchers running more than a handful of studies at a time."
            features={[
              'Unlimited studies',
              'Unlimited interviews',
              'Priority processing',
              'Everything in Solo',
              '21-day free trial',
            ]}
          />
        </div>
      </section>

      {/* ------------------------------------------------------- Closing CTA */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="t-eyebrow text-[var(--color-accent)]">Ready?</p>
        <h2 className="t-display-1 mt-6 text-[var(--color-text-primary)]">
          Stop copy-pasting transcripts into Claude.
        </h2>
        <p className="t-subhead mt-6 text-[var(--color-text-secondary)]">
          Start your 21-day trial. Your first synthesis takes about a minute.
        </p>
        <div className="mt-10">
          <Link
            href="/sign-up"
            className="t-body-m cta-hover inline-flex items-center rounded-md bg-[var(--color-accent)] px-6 py-3 text-[var(--color-bg-base)] transition-colors duration-200 hover:bg-[var(--color-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Start 21-day trial
          </Link>
        </div>
        <p className="t-code mt-6 text-[var(--color-text-tertiary)]">
          No credit card required. Cancel anytime.
        </p>
      </section>

      {/* ------------------------------------------------------------ Footer */}
      <footer className="mx-auto mt-16 max-w-5xl border-t border-[var(--color-border-subtle)] px-6 pt-12 pb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-6">
          <div>
            <p className="t-display-3 text-[var(--color-text-primary)]">Throughline</p>
            <p className="t-code mt-2 text-[var(--color-text-tertiary)]">
              © 2026 Throughline. Made for solo researchers.
            </p>
          </div>
          <ul className="flex flex-wrap gap-6">
            <li>
              <Link
                href="/sign-in"
                className="t-body-m text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                Sign in
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                className="t-body-m text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="t-body-m text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                Terms
              </Link>
            </li>
            <li>
              <a
                href="mailto:hi@throughline.app"
                className="t-body-m text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                Contact
              </a>
            </li>
          </ul>
        </div>
      </footer>
    </main>
  );
}
