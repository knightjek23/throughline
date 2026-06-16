/**
 * POST /api/jobs/analyze-interview
 *
 * QStash target. Verifies signature (or dev bypass), runs the analysis,
 * writes results to the DB, and walks the interview status state machine:
 *
 *   queued → processing → analyzed
 *                       ↘
 *                          failed (failure_reason set)
 *
 * Day 3 calls the real Anthropic analyzer. Failures are mapped to
 * user-facing failure_reason strings via lib/anthropic/failure-reason.
 */

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { analyzeInterview } from '@/lib/anthropic/analyze';
import { failureReason } from '@/lib/anthropic/failure-reason';
import { verifyJobRequest } from '@/lib/qstash';
import { track } from '@/lib/posthog';
import { jsonOk, jsonError } from '@/lib/api/responses';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Pro lets functions run up to 800s. Day 3 transcripts take up
// to ~60s with Anthropic; 300s is comfortably bounded.
export const maxDuration = 300;

const payloadSchema = z.object({
  interviewId: z.string().uuid(),
  userId: z.string().min(1),
  studyId: z.string().uuid(),
});

export async function POST(req: Request) {
  // Signature gate. In production this rejects everything that isn't QStash.
  // In dev the bypass header is honored. See lib/qstash.ts.
  const isValid = await verifyJobRequest(req);
  if (!isValid) {
    logger.warn('analyze-interview: rejected unsigned request');
    return jsonError('unauthorized', 401);
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    const body = await req.json();
    payload = payloadSchema.parse(body);
  } catch (err) {
    logger.warn({ err }, 'analyze-interview: malformed payload');
    // Return 200 so QStash doesn't retry on a permanent payload error.
    return jsonOk({ skipped: 'invalid_payload' });
  }

  const { interviewId, userId, studyId } = payload;
  const supabase = createAdminClient();

  // Move to processing. If the row is gone, bail without retry.
  const { data: interview, error: fetchErr } = await supabase
    .from('interviews')
    .select('id, transcript_text, participant_label, study_id')
    .eq('id', interviewId)
    .maybeSingle();

  if (fetchErr) {
    logger.error({ err: fetchErr, interviewId }, 'failed to fetch interview');
    return jsonError('db error', 500);
  }
  if (!interview) {
    logger.warn({ interviewId }, 'interview not found, skipping');
    return jsonOk({ skipped: 'not_found' });
  }
  if (!interview.transcript_text) {
    await markFailed(interviewId, 'transcript text missing');
    return jsonOk({ skipped: 'no_transcript' });
  }

  await supabase
    .from('interviews')
    .update({ status: 'processing' })
    .eq('id', interviewId);

  // Pull research_question from the parent study so the analysis prompt
  // (Day 3+) can use it as context. Stub ignores it but Day 3 won't.
  const { data: study } = await supabase
    .from('studies')
    .select('research_question')
    .eq('id', studyId)
    .maybeSingle();

  try {
    const result = await analyzeInterview({
      interviewId,
      transcript: interview.transcript_text,
      researchQuestion: study?.research_question ?? null,
      participantLabel: interview.participant_label,
    });

    // Persist analysis. The interview_analyses table has UNIQUE(interview_id)
    // so a re-delivery would 23505; upsert protects against double-processing.
    const { error: analysisErr } = await supabase
      .from('interview_analyses')
      .upsert(
        {
          interview_id: interviewId,
          user_id: userId,
          summary: result.analysis.summary,
          sentiment: result.analysis.sentiment,
          themes_json: result.analysis.themes,
          quotes_json: result.analysis.quotes,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
        },
        { onConflict: 'interview_id' },
      );
    if (analysisErr) throw analysisErr;

    await supabase
      .from('interviews')
      .update({ status: 'analyzed', analyzed_at: new Date().toISOString(), failure_reason: null })
      .eq('id', interviewId);

    void track('interview_analyzed', userId, {
      interviewId,
      studyId,
      droppedQuotes: result.droppedQuotes,
      droppedThemes: result.droppedThemes,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
    logger.info({ interviewId, studyId, userId }, 'interview analyzed');
    return jsonOk({ ok: true, interviewId });
  } catch (err) {
    const reason = failureReason(err);
    logger.error({ err, interviewId }, 'analyze failed');
    await markFailed(interviewId, reason);
    void track('interview_failed', userId, { interviewId, studyId, reason });
    // Return 200 so QStash doesn't retry. We've already recorded the failure.
    return jsonOk({ ok: false, interviewId, reason });
  }
}

async function markFailed(interviewId: string, reason: string) {
  const supabase = createAdminClient();
  await supabase
    .from('interviews')
    .update({ status: 'failed', failure_reason: reason })
    .eq('id', interviewId);
}
