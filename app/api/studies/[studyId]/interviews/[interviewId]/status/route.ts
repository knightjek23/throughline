/**
 * GET /api/studies/[studyId]/interviews/[interviewId]/status
 *
 * Lightweight status endpoint used by the interview detail page auto-poller.
 * Returns just `{ status, failure_reason }` so the client can decide whether
 * to keep polling or trigger a router.refresh() to pull in the full analysis.
 *
 * Auth via Clerk. RLS on the server client scopes the read to the caller,
 * so a user cannot poll another user's interview status by guessing IDs.
 */

import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase/server';
import { jsonOk, jsonError, jsonUnauthorized } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ studyId: string; interviewId: string }> },
) {
  const { studyId, interviewId } = await context.params;
  const { userId } = await auth();
  if (!userId) return jsonUnauthorized();

  const supabase = await createServerClient();
  const { data: interview } = await supabase
    .from('interviews')
    .select('status, failure_reason')
    .eq('id', interviewId)
    .eq('study_id', studyId)
    .maybeSingle();

  if (!interview) {
    return jsonError('interview not found', 404);
  }

  return jsonOk({
    status: interview.status,
    failure_reason: interview.failure_reason,
  });
}
