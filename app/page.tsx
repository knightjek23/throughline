/**
 * Landing page placeholder. Day 7 ships the real hero + sample study + pricing.
 * For Day 1 we just need a public route that the proxy allowlist can hit.
 */

import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
        Throughline
      </p>

      <h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-tight text-[var(--color-text-primary)] sm:text-6xl">
        Research synthesis for solo PMs and UX researchers.
      </h1>

      <p className="mt-6 max-w-lg text-lg leading-relaxed text-[var(--color-text-secondary)]">
        Upload interview transcripts. Get themes, quotes, and cross-study synthesis. $19/mo.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/sign-up"
          className="rounded-md bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-[var(--color-bg-base)] transition-colors duration-200 hover:bg-[var(--color-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Start 21-day trial
        </Link>
        <Link
          href="/sign-in"
          className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-5 py-3 text-sm font-medium text-[var(--color-text-primary)] transition-colors duration-200 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-primary)]"
        >
          Sign in
        </Link>
      </div>

      <p className="mt-16 font-mono text-xs text-[var(--color-text-tertiary)]">
        v0 placeholder. Real landing ships Day 7.
      </p>
    </main>
  );
}
