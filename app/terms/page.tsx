/**
 * /terms — placeholder terms of service.
 * v0 pending real legal drafting. Landing footer links here.
 */

import Link from 'next/link';

export const metadata = {
  title: 'Terms · Throughline',
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <Link
        href="/"
        className="t-eyebrow text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        ← Throughline
      </Link>

      <h1 className="t-display-1 mt-6 text-[var(--color-text-primary)]">Terms</h1>

      <p className="t-subhead mt-6 text-[var(--color-text-secondary)]">
        This is a placeholder. Full terms of service arrive with the public launch. In the
        meantime, here is the short version.
      </p>

      <section className="mt-12 space-y-8">
        <div>
          <h2 className="t-display-3 text-[var(--color-text-primary)]">Your data is yours</h2>
          <p className="t-body-l mt-3 text-[var(--color-text-secondary)]">
            You retain full ownership of every transcript you upload and every analysis
            Throughline produces from it. Cancel anytime and your data goes with you.
          </p>
        </div>

        <div>
          <h2 className="t-display-3 text-[var(--color-text-primary)]">Reasonable use</h2>
          <p className="t-body-l mt-3 text-[var(--color-text-secondary)]">
            Do not upload material you do not have the right to analyze. Do not attempt to
            circumvent plan limits or reverse-engineer the service.
          </p>
        </div>

        <div>
          <h2 className="t-display-3 text-[var(--color-text-primary)]">Availability</h2>
          <p className="t-body-l mt-3 text-[var(--color-text-secondary)]">
            Throughline is a solo project during v1. Best-effort uptime, no SLA. If something is
            broken, email{' '}
            <a
              href="mailto:hi@throughline.app"
              className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
            >
              hi@throughline.app
            </a>{' '}
            and it usually gets fixed the same day.
          </p>
        </div>

        <div>
          <h2 className="t-display-3 text-[var(--color-text-primary)]">Cancellations and refunds</h2>
          <p className="t-body-l mt-3 text-[var(--color-text-secondary)]">
            Cancel anytime from your account. Prorated refunds are available on request within 7
            days of a charge.
          </p>
        </div>
      </section>

      <p className="t-code mt-16 text-[var(--color-text-tertiary)]">
        Placeholder v0. Full terms of service ships with the public launch.
      </p>
    </main>
  );
}
