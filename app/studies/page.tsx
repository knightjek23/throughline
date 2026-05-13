/**
 * /studies — placeholder for Day 1.
 * Day 5 ships the real studies list. For now this is a proof-of-life
 * authenticated route that exercises the full lazy-mirror + RLS pipeline.
 */

import { ensureUser } from '@/lib/users';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function StudiesPage() {
  const user = await ensureUser();

  const supabase = await createServerClient();
  const { data: rlsCheck } = await supabase
    .from('users')
    .select('id, email, plan, trial_ends_at')
    .eq('id', user.id)
    .single();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
        Throughline
      </p>
      <h1 className="mt-6 font-display text-4xl tracking-tight text-[var(--color-text-primary)]">
        Studies
      </h1>
      <p className="mt-3 text-[var(--color-text-secondary)]">
        v0 placeholder. The real studies list ships on Day 5.
      </p>

      <div className="mt-10 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5 text-sm">
        <p className="font-medium text-[var(--color-text-primary)]">Auth + DB pipeline check</p>
        <pre className="mt-3 overflow-auto rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-3 font-mono text-xs text-[var(--color-text-primary)]">
          {JSON.stringify(
            {
              ensured: {
                id: user.id,
                email: user.email,
                plan: user.plan,
                trial_ends_at: user.trial_ends_at,
              },
              rlsCheck,
            },
            null,
            2,
          )}
        </pre>
        <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
          Both blocks should match. If <code className="font-mono">ensured</code> populates but{' '}
          <code className="font-mono">rlsCheck</code> is null, RLS or the Clerk–Supabase
          integration is misconfigured.
        </p>
      </div>
    </main>
  );
}
