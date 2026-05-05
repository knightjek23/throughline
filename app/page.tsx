/**
 * Landing page placeholder. Day 7 ships the real hero + sample study + pricing.
 * For Day 1 we just need a public route that the middleware allowlist can hit.
 */

import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-slate-500">Throughline</p>
      <h1 className="mt-4 text-5xl font-semibold tracking-tight text-slate-900">
        Research synthesis for solo PMs and UX researchers.
      </h1>
      <p className="mt-6 max-w-lg text-lg text-slate-600">
        Upload interview transcripts. Get themes, quotes, and cross-study synthesis. $19/mo.
      </p>
      <div className="mt-10 flex gap-4">
        <Link
          href="/sign-up"
          className="rounded-md bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800"
        >
          Start 21-day trial
        </Link>
        <Link
          href="/sign-in"
          className="rounded-md border border-slate-300 px-5 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Sign in
        </Link>
      </div>
      <p className="mt-12 text-xs text-slate-400">v0 placeholder — real landing ships Day 7.</p>
    </main>
  );
}
