/**
 * Supabase client bound to the Clerk-authenticated user.
 *
 * Uses Clerk's native Supabase third-party auth integration (the JWT-template
 * flow was deprecated 2025-04-01). The standard Clerk session token carries
 * the `role: "authenticated"` claim and is verified by Supabase via Clerk's
 * JWKS. RLS policies read `auth.jwt()->>'sub'` to resolve the user.
 *
 * Setup required (one-time, per Supabase project):
 *  1. Clerk dashboard → Integrations → Supabase → Activate, copy Clerk Domain
 *  2. Supabase dashboard → Authentication → Sign In/Up → Third Party Auth
 *     → Add Clerk, paste Clerk Domain
 *
 * Use this for any read/write performed on behalf of the user.
 * Use `createAdminClient()` (lib/supabase/admin.ts) for service-role work.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';
import type { Database } from './types';

export async function createServerClient(): Promise<SupabaseClient<Database>> {
  const { getToken } = await auth();
  const token = await getToken();

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
