/**
 * POST /api/studies/[studyId]/synthesize
 *
 * User-triggered aggregate cross-study synthesis. Replaces the auto-trigger
 * approach (removed Day 4) with an explicit CTA on the Aggregate tab.
 *
 * Synchronous: this route awaits the Anthropic call and the DB writes
 * before returning. With Sonnet 4.6 + 3 to 25 interviews, typical wall
 * clock is 30 to 60 seconds, well within Vercel Pro's 300s function cap.
 * Client shows a spinner during the wait and refreshes on success.
 */

import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase/server';
import { ensureUser } from '@/lib/users';
import { synthesizeStudy, type SynthesizeStudyInterview } from '@/lib/anthropic/synthesize';
import { failureReason } from '@/lib/anthropic/failure-reason';
import { jsonOk, jsonError, jsonUnauthorized } from '@/lib/api/responses';
import { track } from '@/lib/posthog';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

export async function POST(
  _req: Request,
  context: { params: Promise<{ studyId: string }> },
) {
  const { studyId } = await context.params;
  const { userId } = await auth();
  if (!userId) return jsonUnauthorized();

  await ensureUser();
  const supabase = await createServerClient();

  // RLS scopes this to the authenticated user. If they don't own the
  // study, the select returns no row and we 404.
  const { data: study } = await supabase
    .from('studies')
    .select('id')
    .eq('id', studyId)
    .maybeSingle();

  if (!study) {
    return jsonError('study not found', 404);
  }

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
    return jsonError('failed to load analyses', 500);
  }

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
    return jsonError(
      `Need at least ${MIN_INTERVIEWS} analyzed interviews. You have ${interviews.length}.`,
      400,
    );
  }

  try {
    const result = await synthesizeStudy({ interviews });

    // Clear prior aggregate rows for this study and insert the fresh batch.
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
    return jsonOk({ ok: true, themeCount: result.themes.length });
  } catch (err) {
    const reason = failureReason(err);
    logger.error({ err, studyId, reason }, 'synthesis failed');
    return jsonError(reason, 500);
  }
}
