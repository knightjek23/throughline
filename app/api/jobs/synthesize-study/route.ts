/**
 * POST /api/jobs/synthesize-study
 *
 * QStash target. Runs cross-study aggregate synthesis: pulls every
 * analyzed interview's analysis, dedups themes across them, and upserts
 * the result into `study_themes`. Triggered from analyze-interview/route
 * after each upload past the 3rd reaches `status='analyzed'`.
 *
 * Idempotent: `study_themes` is UNIQUE on study_id. Reruns replace the
 * previous synthesis row. Failures are logged + tracked in PostHog but
 * do not write to a failure column (v1 surfaces failures only via logs).
 */

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { synthesizeStudy, type SynthesizeStudyInterview } from '@/lib/anthropic/synthesize';
import { verifyJobRequest } from '@/lib/qstash';
import { failureReason } from '@/lib/anthropic/failure-reason';
import { track } from '@/lib/posthog';
import { jsonOk, jsonError } from '@/lib/api/responses';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Typical synthesis call on Sonnet 4.6 for 3 to 25 interviews runs ~10 to 30s.
// 300s is the same comfortable upper bound used by analyze-interview.
export const maxDuration = 300;

const payloadSchema = z.object({
  studyId: z.string().uuid(),
  userId: z.string().min(1),
});

const MIN_INTERVIEWS = 3;

type Sentiment = 'positive' | 'mixed' | 'negative' | 'neutral';

interface RawAnalysisJoin {
  id: string;
  interview_analyses:
    | {
        themes_json: unknown;
        quotes_json: unknown;
        summary: string | null;
        sentiment: string | null;
      }
    | Array<{
        themes_json: unknown;
        quotes_json: unknown;
        summary: string | null;
        sentiment: string | null;
      }>
    | null;
}

export async function POST(req: Request) {
  const isValid = await verifyJobRequest(req);
  if (!isValid) {
    logger.warn('synthesize-study: rejected unsigned request');
    return jsonError('unauthorized', 401);
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    const body = await req.json();
    payload = payloadSchema.parse(body);
  } catch (err) {
    logger.warn({ err }, 'synthesize-study: malformed payload');
    // 200 so QStash doesn't retry a permanently bad payload.
    return jsonOk({ skipped: 'invalid_payload' });
  }

  const { studyId, userId } = payload;
  const supabase = createAdminClient();

  // Pull analyzed interviews + their analyses in a single join.
  const { data: rows, error: fetchErr } = await supabase
    .from('interviews')
    .select(
      `
      id,
      interview_analyses (
        themes_json,
        quotes_json,
        summary,
        sentiment
      )
    `,
    )
    .eq('study_id', studyId)
    .eq('status', 'analyzed');

  if (fetchErr) {
    logger.error({ err: fetchErr, studyId }, 'failed to fetch analyses');
    return jsonError('db error', 500);
  }

  // Build SynthesizeStudyInterview[]. The join may return interview_analyses
  // as a single object (1:1 FK) or an array; handle both for safety.
  const interviews: SynthesizeStudyInterview[] = (rows ?? [])
    .map((row: RawAnalysisJoin) => {
      const ia = Array.isArray(row.interview_analyses)
        ? row.interview_analyses[0]
        : row.interview_analyses;
      if (!ia) return null;
      const themes =
        (ia.themes_json as Array<{ name: string; description: string }> | null) ?? [];
      const quotes =
        (ia.quotes_json as Array<{
          text: string;
          theme: string;
          char_start: number;
          char_end: number;
        }> | null) ?? [];
      return {
        interview_id: row.id,
        themes,
        quotes,
        summary: ia.summary ?? '',
        sentiment: (ia.sentiment ?? 'neutral') as Sentiment,
      };
    })
    .filter((iv): iv is SynthesizeStudyInterview => iv !== null);

  if (interviews.length < MIN_INTERVIEWS) {
    logger.info(
      { studyId, count: interviews.length },
      'synthesize-study: too few analyzed interviews, skipping',
    );
    return jsonOk({ skipped: 'too_few_interviews', count: interviews.length });
  }

  try {
    const result = await synthesizeStudy({ interviews });

    // `study_themes` is one row per aggregate theme, not one row per study.
    // Strategy: clear prior aggregate rows for this study, then insert the
    // fresh batch. v1.1 will preserve user_edited=true rows when theme
    // editing ships; for v1 no editing UI exists so blanket delete is safe.
    const { error: deleteErr } = await supabase
      .from('study_themes')
      .delete()
      .eq('study_id', studyId);
    if (deleteErr) throw deleteErr;

    const themeRows = result.themes.map((theme) => ({
      study_id: studyId,
      user_id: userId,
      name: theme.name,
      description: theme.description,
      frequency: theme.frequency,
      source_quote_refs: theme.source_quote_refs,
    }));

    const { error: insertErr } = await supabase.from('study_themes').insert(themeRows);
    if (insertErr) throw insertErr;

    void track('aggregate_synthesized', userId, {
      studyId,
      themeCount: result.themes.length,
      droppedThemes: result.droppedThemes,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      interviewCount: interviews.length,
    });

    logger.info(
      { studyId, userId, themeCount: result.themes.length, interviewCount: interviews.length },
      'study synthesized',
    );
    return jsonOk({ ok: true, studyId, themeCount: result.themes.length });
  } catch (err) {
    const reason = failureReason(err);
    logger.error({ err, studyId, reason }, 'synthesis failed');
    void track('aggregate_synthesized', userId, { studyId, error: reason });
    // 200 so QStash doesn't retry. We've already logged + tracked.
    return jsonOk({ ok: false, studyId, reason });
  }
}
