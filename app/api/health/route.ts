/**
 * GET /api/health
 *
 * Deep health check. Used by uptime monitor + Vercel deploy verification.
 * Pings Supabase + Anthropic. Returns 200 only when all checks pass.
 *
 * Per dev principles: this route ships before any other.
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { check } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckResult = 'ok' | 'fail';
type HealthBody = {
  ok: boolean;
  env: string;
  checks: {
    db: CheckResult;
    anthropic: CheckResult;
  };
  errors?: Record<string, string>;
  latency_ms: {
    db?: number;
    anthropic?: number;
  };
  ts: string;
};

async function checkDb(): Promise<{ result: CheckResult; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const supabase = createAdminClient();
    // Cheap query — counts a constant; doesn't touch any user table
    const { error } = await supabase.from('users').select('id', { count: 'exact', head: true });
    if (error) throw error;
    return { result: 'ok', latency: Date.now() - start };
  } catch (err) {
    return {
      result: 'fail',
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : 'unknown db error',
    };
  }
}

async function checkAnthropic(): Promise<{ result: CheckResult; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // Minimum-token sanity ping. Cost: <$0.0001 per check.
    await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return { result: 'ok', latency: Date.now() - start };
  } catch (err) {
    return {
      result: 'fail',
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : 'unknown anthropic error',
    };
  }
}

export async function GET(req: Request) {
  // This route is public and the Anthropic ping costs real money per hit.
  // Rate limit by IP (20/min, shared with the auth limiter) so a scraper
  // can't run up the API bill. Uptime monitors ping ~1/min, well under it.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = await check('auth', `health:${ip}`).catch(() => null);
  if (rl && !rl.success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const [db, anthropic] = await Promise.all([checkDb(), checkAnthropic()]);

  const allOk = db.result === 'ok' && anthropic.result === 'ok';
  const errors: Record<string, string> = {};
  if (db.error) errors.db = db.error;
  if (anthropic.error) errors.anthropic = anthropic.error;

  const body: HealthBody = {
    ok: allOk,
    env: process.env.NEXT_PUBLIC_APP_ENV ?? 'unknown',
    checks: {
      db: db.result,
      anthropic: anthropic.result,
    },
    latency_ms: {
      db: db.latency,
      anthropic: anthropic.latency,
    },
    ts: new Date().toISOString(),
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  };

  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
