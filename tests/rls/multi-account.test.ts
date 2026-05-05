/**
 * Multi-account RLS smoke test. MUST PASS before Day 2.
 *
 * Verifies the load-bearing security claim: user A cannot read user B's data.
 * Run via: npx vitest run tests/rls
 *
 * This test bypasses Clerk and signs JWTs directly with the Supabase JWT secret
 * to simulate two authenticated users. Requires SUPABASE_JWT_SECRET in env
 * (Project Settings → API → JWT Settings).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

const USER_A = 'user_test_a_' + Date.now();
const USER_B = 'user_test_b_' + Date.now();

async function makeJwt(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return await new SignJWT({ sub: userId, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

function clientFor(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

describe('RLS: cross-user isolation', () => {
  let userAStudyId: string;

  beforeAll(async () => {
    // Seed both users + a study owned by A — via service role (bypasses RLS).
    const { error: usersErr } = await admin.from('users').upsert([
      { id: USER_A, email: `${USER_A}@test.local`, plan: 'trial' },
      { id: USER_B, email: `${USER_B}@test.local`, plan: 'trial' },
    ]);
    if (usersErr) throw new Error(`seed users failed: ${usersErr.message}`);

    const { data, error } = await admin
      .from('studies')
      .insert({
        user_id: USER_A,
        name: 'Secret Study',
        research_question: 'Should not be visible to B',
      })
      .select('id')
      .single();
    if (error) throw new Error(`seed study failed: ${error.message}`);
    userAStudyId = data.id;
  });

  afterAll(async () => {
    await admin.from('users').delete().in('id', [USER_A, USER_B]);
  });

  it('user A can read their own study', async () => {
    const tokenA = await makeJwt(USER_A);
    const sb = clientFor(tokenA);
    const { data, error } = await sb.from('studies').select('id').eq('id', userAStudyId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('user B CANNOT read user A study', async () => {
    const tokenB = await makeJwt(USER_B);
    const sb = clientFor(tokenB);
    const { data, error } = await sb.from('studies').select('id').eq('id', userAStudyId);
    expect(error).toBeNull(); // RLS doesn't error — it filters
    expect(data).toHaveLength(0);
  });

  it('user B CANNOT update user A study', async () => {
    const tokenB = await makeJwt(USER_B);
    const sb = clientFor(tokenB);
    const { data, error } = await sb
      .from('studies')
      .update({ name: 'Hacked' })
      .eq('id', userAStudyId)
      .select();
    // Either filtered to no rows or denied. Both are acceptable.
    expect(data ?? []).toHaveLength(0);
    if (error) expect(error.code).toMatch(/^(42501|PGRST)/);
  });

  it('anon (no token) CANNOT read any studies', async () => {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await sb.from('studies').select('id').limit(1);
    expect(data ?? []).toHaveLength(0);
  });
});
