/**
 * /privacy — placeholder privacy notice.
 * v0 pending real legal drafting. Landing footer links here.
 */

import Link from 'next/link';

export const metadata = {
  title: 'Privacy · Throughline',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <Link
        href="/"
        className="t-eyebrow text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        ← Throughline
      </Link>

      <h1 className="t-display-1 mt-6 text-[var(--color-text-primary)]">Privacy</h1>

      <p className="t-subhead mt-6 text-[var(--color-text-secondary)]">
        This is a placeholder. A real privacy notice is coming with the public launch. In the
        meantime, here is what you should know.
      </p>

      <section className="mt-12 space-y-8">
        <div>
          <h2 className="t-display-3 text-[var(--color-text-primary)]">What we store</h2>
          <p className="t-body-l mt-3 text-[var(--color-text-secondary)]">
            Interview transcripts you upload, the analyses Throughline produces from them, and
            your account info (email, name from Clerk). Storage is on Supabase.
          </p>
        </div>

        <div>
          <h2 className="t-display-3 text-[var(--color-text-primary)]">Who can see it</h2>
          <p className="t-body-l mt-3 text-[var(--color-text-secondary)]">
            Only you. Every study is scoped to your user_id via row-level security. Support
            access to your data requires your explicit written consent.
          </p>
        </div>

        <div>
          <h2 className="t-display-3 text-[var(--color-text-primary)]">Model training</h2>
          <p className="t-body-l mt-3 text-[var(--color-text-secondary)]">
            Your transcripts are sent to Anthropic to produce analyses. Anthropic does not train
            on API traffic. Your data is not used to train Throughline or anyone else.
          </p>
        </div>

        <div>
          <h2 className="t-display-3 text-[var(--color-text-primary)]">Deleting your data</h2>
          <p className="t-body-l mt-3 text-[var(--color-text-secondary)]">
            Email{' '}
            <a
              href="mailto:hi@throughline.app"
              className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
            >
              hi@throughline.app
            </a>
            . We will remove your account and all associated studies, interviews, and analyses
            within 7 days.
          </p>
        </div>
      </section>

      <p className="t-code mt-16 text-[var(--color-text-tertiary)]">
        Placeholder v0. Full privacy policy ships with the public launch.
      </p>
    </main>
  );
}
