/**
 * /studies/[studyId]/interviews/[interviewId]
 *
 * Read-only interview detail. Day 3 surface so we can dogfood the real
 * Anthropic analysis output in the actual UI rather than the SQL editor.
 * Day 4 layers on theme editing, quote highlighting in the transcript,
 * and aggregate cross-study synthesis.
 *
 * States handled:
 *   - analyzed: full analysis rendered (summary, sentiment, themes, quotes)
 *   - queued / processing: in-progress placeholder
 *   - failed: failure_reason surfaced
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ensureUser } from '@/lib/users';
import { createServerClient } from '@/lib/supabase/server';
import {
  InterviewDetailPoller,
  type InterviewStatus,
} from './_components/interview-detail-poller';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ studyId: string; interviewId: string }>;
}

interface Theme {
  name: string;
  description: string;
}

interface Quote {
  text: string;
  theme: string;
  char_start: number;
  char_end: number;
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

export default async function InterviewDetailPage({ params }: PageProps) {
  const { studyId, interviewId } = await params;
  await ensureUser();

  const supabase = await createServerClient();

  const { data: interview } = await supabase
    .from('interviews')
    .select(
      'id, filename, status, word_count, uploaded_at, analyzed_at, failure_reason, participant_label, study_id',
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

  return (
    <InterviewDetailPoller
      studyId={studyId}
      interviewId={interviewId}
      initialStatus={interview.status as InterviewStatus}
    >
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href={`/studies/${studyId}`}
        className="t-eyebrow text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        ← Study
      </Link>

      <h1 className="t-display-1 mt-4 text-[var(--color-text-primary)]">{interview.filename}</h1>

      <p className="t-code mt-3 text-[var(--color-text-tertiary)]">
        {interview.word_count != null ? `${interview.word_count.toLocaleString()} words · ` : ''}
        uploaded {relativeTime(interview.uploaded_at)}
        {interview.analyzed_at ? ` · analyzed ${relativeTime(interview.analyzed_at)}` : ''}
        {interview.participant_label ? ` · ${interview.participant_label}` : ''}
      </p>

      {interview.status === 'queued' || interview.status === 'processing' ? (
        <section className="t-body-m mt-10 rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] p-6 text-[var(--color-text-secondary)]">
          Analysis in progress. This page will fill in once the model finishes. Refresh in a
          moment.
        </section>
      ) : null}

      {interview.status === 'failed' ? (
        <section className="mt-10 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6">
          <h2 className="t-eyebrow text-[var(--color-text-secondary)]">Analysis failed</h2>
          <p className="t-body-m mt-3 text-[var(--color-text-primary)]">
            {interview.failure_reason ?? 'No reason recorded.'}
          </p>
        </section>
      ) : null}

      {interview.status === 'analyzed' && analysis ? (
        <>
          <section className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="t-eyebrow text-[var(--color-text-secondary)]">Summary</h2>
              {analysis.sentiment ? (
                <span
                  className={`t-eyebrow rounded-full px-3 py-1 ${SENTIMENT_STYLE[analysis.sentiment] ?? ''}`}
                >
                  {SENTIMENT_LABEL[analysis.sentiment] ?? analysis.sentiment}
                </span>
              ) : null}
            </div>
            <p className="t-subhead mt-4 text-[var(--color-text-primary)]">{analysis.summary}</p>
          </section>

          <section className="mt-12">
            <h2 className="t-eyebrow text-[var(--color-text-secondary)]">
              Themes ({themes.length})
            </h2>
            <ul className="mt-4 space-y-4">
              {themes.map((theme, i) => {
                const themeQuotes = quotes.filter((q) => q.theme === theme.name);
                return (
                  <li
                    key={`${theme.name}-${i}`}
                    className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="t-display-3 text-[var(--color-text-primary)]">{theme.name}</h3>
                      <span className="t-code shrink-0 text-[var(--color-text-tertiary)]">
                        {themeQuotes.length} {themeQuotes.length === 1 ? 'quote' : 'quotes'}
                      </span>
                    </div>
                    <p className="t-body-m mt-2 text-[var(--color-text-secondary)]">
                      {theme.description}
                    </p>
                    {themeQuotes.length > 0 ? (
                      <ul className="mt-4 space-y-3 border-t border-[var(--color-border-subtle)] pt-4">
                        {themeQuotes.map((quote, qi) => (
                          <li
                            key={`${theme.name}-q-${qi}`}
                            className="t-italic-stat border-l-2 border-[var(--color-accent)] pl-4 text-[var(--color-text-primary)]"
                          >
                            &ldquo;{quote.text}&rdquo;
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="t-code mt-12 text-[var(--color-text-tertiary)]">
            {analysis.input_tokens?.toLocaleString() ?? 0} input tokens ·{' '}
            {analysis.output_tokens?.toLocaleString() ?? 0} output tokens
          </p>
        </>
      ) : null}
    </main>
    </InterviewDetailPoller>
  );
}
