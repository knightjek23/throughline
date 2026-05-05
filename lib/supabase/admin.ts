/**
 * Service-role Supabase client. Bypasses RLS.
 * USE ONLY IN: webhook handlers (Clerk, Stripe), background jobs (QStash targets),
 * and the /api/health DB ping. Never reachable from client code.
 *
 * Server-only — relies on SUPABASE_SERVICE_ROLE_KEY which must NEVER be exposed.
 */

import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

let cached: SupabaseClient<Database> | null = null;

export function createAdminClient(): SupabaseClient<Database> {
  if (cached) return cached;
  cached = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return cached;
}
