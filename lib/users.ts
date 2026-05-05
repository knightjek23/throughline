/**
 * User mirror helper. Lazy-creates the public.users row on first authenticated
 * server request, replacing the Clerk webhook approach.
 *
 * Why lazy instead of webhook:
 *  - No ngrok / public URL needed for local dev
 *  - Resilient to webhook delivery failures
 *  - One fewer moving piece to monitor
 *
 * Trade-off: the row gets created when the user first hits a server route
 * that calls ensureUser(), not the moment they sign up. For our use case the
 * user can't do anything until they hit a server route anyway, so this is fine.
 *
 * Uses the admin (service-role) client because the users table RLS only
 * permits SELECT/UPDATE for self — INSERT is server-side only.
 */

import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TRIAL_DAYS, type Plan } from '@/lib/plans';
import { logger } from '@/lib/logger';

export interface UserRow {
  id: string;
  email: string;
  plan: Plan;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Returns the user's public.users row, creating it with a 21-day trial on
 * first call. Throws if the request is not authenticated.
 */
export async function ensureUser(): Promise<UserRow> {
  const { userId } = await auth();
  if (!userId) throw new Error('ensureUser: not authenticated');

  const supabase = createAdminClient();

  // Fast path — row already exists
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (existing) return existing as UserRow;

  // Slow path — first authenticated request after sign-up. Pull email from Clerk and insert.
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress;
  if (!email) {
    throw new Error(`ensureUser: clerk user ${userId} has no email`);
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const { data: created, error } = await supabase
    .from('users')
    .insert({
      id: userId,
      email,
      plan: 'trial' satisfies Plan,
      trial_ends_at: trialEndsAt.toISOString(),
    })
    .select('*')
    .single();

  if (!error && created) {
    logger.info({ userId, email }, 'user lazily created on first request');
    return created as UserRow;
  }

  // 23505 = unique_violation. Means another request created the row between
  // our SELECT and our INSERT (e.g., user opens two tabs after sign-up).
  // Read the row back and return it.
  if (error && error.code === '23505') {
    const { data: raced, error: readErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    if (raced && !readErr) return raced as UserRow;
  }

  logger.error({ userId, error }, 'ensureUser: insert failed');
  throw new Error(`ensureUser: failed to create user (${error?.message ?? 'unknown'})`);
}
