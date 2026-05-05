/**
 * /studies — placeholder for Day 1.
 * Day 5 ships the real studies list. For now this is a proof-of-life
 * authenticated route that exercises the full lazy-mirror + RLS pipeline.
 */

import { ensureUser } from '@/lib/users';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function StudiesPage() {
  // Lazy create the public.users row on first authenticated request.
  const user = await ensureUser();

  // Sanity read against RLS using the user's Clerk-issued JWT.
  // If RLS is wired correctly, this returns the same row by a different path.
  const supabase = await createServerClient();
  const { data: rlsCheck } = await supabase
    .from('users')
    .select('id, email, plan, trial_ends_at')
    .eq('id', user.id)
    .single();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Studies</h1>
      <p className="mt-3 text-slate-600">
        v0 placeholder. The real studies list ships on Day 5.
      </p>

      <div className="mt-10 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm">
        <p className="font-medium text-slate-700">Auth + DB pipeline check</p>
        <pre className="mt-3 overflow-auto rounded bg-white p-3 text-xs text-slate-800">
          {JSON.stringify(
            {
              ensured: { id: user.id, email: user.email, plan: user.plan, trial_ends_at: user.trial_ends_at },
              rlsCheck,
            },
            null,
            2,
          )}
        </pre>
        <p className="mt-3 text-xs text-slate-500">
          Both blocks should match. If <code>ensured</code> populates but{' '}
          <code>rlsCheck</code> is null, RLS / the Clerk-Supabase integration is
          misconfigured.
        </p>
      </div>
    </main>
  );
}
