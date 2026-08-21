/**
 * /studies/[studyId]/interviews/[interviewId]
 *
 * Interview detail. Day 3 shipped the read-only analysis, Day 5 added polling,
 * and Day 7 adds the evidence spine: the transcript rendered alongside the
 * analysis with every quote wired to its exact character span in both
 * directions.
 *
 * The two-column split only exists on the analyzed branch. A queued, processing
 * or failed interview has no quotes to render, so it keeps the single editorial
 * column the rest of the app uses rather than going wide with an empty half.
 *
 * States handled:
 *   - analyzed: two columns, analysis left, transcript right
 *   - queued / processing: in-progress status, single column
 *   - failed: failure_reason surfaced, single column
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ensureUser } from '@/lib/users';
import { createServerClient } from '@/lib/supabase/server';
import type { Quote, Theme } from '@/lib/evidence/types';
import {
  InterviewDetailPoller,
  type InterviewStatus,
} from './_components/interview-detail-poller';
import { EvidenceSpine } from './_components/evidence-spine';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ studyId: string; interviewId: string }>;
  searchParams: Promise<{ q?: string }>;
}

const SENTIMENT_LABEL: Record<string, string> = {
  positive: 'Positive',
  mixed: 'Mixed',
  negative: 'Negative',
  neutral: 'Neutral',
};

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'bg-[#D9E5CE] text-[#3F5530]',
  mixed: 'bg-[#FBE9C1] text-[#7A5A0A]',
  negative: 'bg-[#F2D4CE] text-[#7A2E20]',
  neutral: 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]',
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

/**
 * `?q=` addresses a quote by its index in quotes_json. Anything out of range or
 * not an integer is ignored rather than thrown: a stale link should open the
 * page unfocused, not error.
 */
function parseQuoteIndex(raw: string | undefined, quoteCount: number): number | null {
  if (!raw) return null;
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 0 || index >= quoteCount) return null;
  return index;
}

/** In-progress copy names the real work and the real wait, per the Day 7 spec. */
function progressCopy(status: InterviewStatus, wordCount: number | null): string {
  if (status === 'processing') {
    return 'Pulling themes and matching quotes back to the transcript.';
  }
  return wordCount != null
    ? `Reading ${wordCount.toLocaleString()} words and pulling out themes. Usually 30 to 60 seconds.`
    : 'Reading the transcript and pulling out themes. Usually 30 to 60 seconds.';
}

export default async function InterviewDetailPage({ params, searchParams }: PageProps) {
  const { studyId, interviewId } = await params;
  const { q } = await searchParams;
  await ensureUser();

  const supabase = await createServerClient();

  const { data: interview } = await supabase
    .from('interviews')
    .select(
      'id, filename, status, word_count, uploaded_at, analyzed_at, failure_reason, participant_label, study_id, transcript_text',
    )
    .eq('id', interviewId)
    .maybeSingle();

  if (!interview || interview.study_id !== studyId) {
    notFound();
  }

  const { data: analysis } = await supabase
    .from('interview_analyses')
    .select('summary, sentiment, themes_json, quotes_json, input_tokens, output_tokens')
    .eq('interview_id', interviewId)
    .maybeSingle();

  const themes = (analysis?.themes_json as Theme[] | null) ?? [];
  const quotes = (analysis?.quotes_json as Quote[] | null) ?? [];
  const status = interview.status as InterviewStatus;
  const isAnalyzed = status === 'analyzed' && Boolean(analysis);
  const initialQuote = isAnalyzed ? parseQuoteIndex(q, quotes.length) : null;

  return (
    <InterviewDetailPoller studyId={studyId} interviewId={interviewId} initialStatus={status}>
      <main className={`mx-auto px-6 py-16 ${isAnalyzed ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <Link
          href={`/studies/${studyId}`}
          className="t-eyebrow text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          ← Study
        </Link>

        <h1 className="t-display-1 mt-4 text-[var(--color-text-primary)]">{interview.filename}</h1>

        <p className="t-code ku-num mt-4 text-[var(--color-text-tertiary)]">
          {interview.word_count != null ? `${interview.word_count.toLocaleString()} words · ` : ''}
          uploaded {relativeTime(interview.uploaded_at)}
          {interview.analyzed_at ? ` · analyzed ${relativeTime(interview.analyzed_at)}` : ''}
          {interview.participant_label ? ` · ${interview.participant_label}` : ''}
        </p>

        {status === 'queued' || status === 'processing' ? (
          <section className="t-body-m mt-10 rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] p-6 text-[var(--color-text-secondary)]">
            {progressCopy(status, interview.word_count)}
          </section>
        ) : null}

        {status === 'failed' ? (
          <section className="mt-10 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6">
            <h2 className="t-eyebrow text-[var(--color-text-secondary)]">Analysis failed</h2>
            <p className="t-body-m mt-4 text-[var(--color-text-primary)]">
              {interview.failure_reason ?? 'No reason recorded.'}
            </p>
          </section>
        ) : null}

        {isAnalyzed && analysis ? (
          <>
            <section className="mt-10 max-w-3xl">
              <div className="flex items-center justify-between gap-4">
                <h2 className="t-eyebrow text-[var(--color-text-secondary)]">Summary</h2>
                {analysis.sentiment ? (
                  <span
                    className={`t-eyebrow rounded-full px-4 py-1 ${SENTIMENT_STYLE[analysis.sentiment] ?? ''}`}
                  >
                    {SENTIMENT_LABEL[analysis.sentiment] ?? analysis.sentiment}
                  </span>
                ) : null}
              </div>
              <p className="t-subhead mt-4 text-[var(--color-text-primary)]">{analysis.summary}</p>
            </section>

            <EvidenceSpine
              themes={themes}
              quotes={quotes}
              transcript={interview.transcript_text ?? null}
              initialQuote={initialQuote}
            />

            <p className="t-code ku-num mt-12 text-[var(--color-text-tertiary)]">
              {analysis.input_tokens?.toLocaleString() ?? 0} input tokens ·{' '}
              {analysis.output_tokens?.toLocaleString() ?? 0} output tokens
            </p>
          </>
        ) : null}
      </main>
    </InterviewDetailPoller>
  );
}
