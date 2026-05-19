/**
 * POST /api/studies
 *
 * Create a new study for the authenticated user.
 * Rate-limited (5 study creations per hour per user).
 * The user row is lazy-created here if it doesn't exist yet (covers the
 * edge case where a user signs up and creates a study before visiting
 * /studies, which would normally trigger ensureUser).
 */

import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { ensureUser } from '@/lib/users';
import { check } from '@/lib/ratelimit';
import { jsonOk, jsonError, jsonUnauthorized, jsonRateLimited } from '@/lib/api/responses';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createStudySchema = z.object({
  name: z.string().min(1, 'name is required').max(120, 'name must be 120 chars or fewer'),
  research_question: z
    .string()
    .max(280, 'research question must be 280 chars or fewer')
    .nullish()
    .transform((v) => (v ? v : null)),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return jsonUnauthorized();

  // Rate limit: 5 study creations per hour per user.
  const rl = await check('studyCreate', userId);
  if (!rl.success) {
    const retrySeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
    return jsonRateLimited(retrySeconds);
  }

  // Parse body. Reject malformed JSON or schema mismatches with 400.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid json body', 400);
  }
  const parsed = createStudySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation failed', 400, parsed.error.issues);
  }

  // Make sure the user row exists. This is a no-op if /studies was visited
  // first (ensureUser already ran there), but catches users who POST directly.
  await ensureUser();

  // Insert via RLS-context client. The Clerk JWT carries the user id, and the
  // studies_owner_all policy allows insert when user_id = auth.jwt()->>'sub'.
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('studies')
    .insert({
      user_id: userId,
      name: parsed.data.name,
      research_question: parsed.data.research_question,
    })
    .select('id, name, research_question, status, created_at')
    .single();

  if (error) {
    logger.error({ err: error, userId }, 'failed to create study');
    return jsonError('failed to create study', 500);
  }

  return jsonOk(data, 201);
}
