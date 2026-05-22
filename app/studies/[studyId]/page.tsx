/**
 * /studies/[studyId] — study detail page.
 * Day 2 surface: study name + research question, upload form, interview list
 * with polling-based status updates. Day 5 adds tabs (Interviews | Aggregate),
 * interview detail pages, and theme editing.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ensureUser } from '@/lib/users';
import { createServerClient } from '@/lib/supabase/server';
import { UploadForm } from './_components/upload-form';
import { InterviewList, type InterviewRow } from './_components/interview-list';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ studyId: string }>;
}

export default async function StudyDetailPage({ params }: PageProps) {
  const { studyId } = await params;
  await ensureUser();

  const supabase = await createServerClient();

  const { data: study } = await supabase
    .from('studies')
    .select('id, name, research_question, created_at')
    .eq('id', studyId)
    .maybeSingle();

  if (!study) {
    notFound();
  }

  const { data: interviewsData } = await supabase
    .from('interviews')
    .select('id, filename, status, word_count, uploaded_at, analyzed_at, failure_reason')
    .eq('study_id', studyId)
    .order('uploaded_at', { ascending: false });

  const interviews: InterviewRow[] = (interviewsData ?? []) as InterviewRow[];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/studies"
        className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        ← Studies
      </Link>

      <h1 className="mt-4 font-display text-4xl tracking-tight text-[var(--color-text-primary)]">
        {study.name}
      </h1>
      {study.research_question && (
        <p className="mt-3 max-w-2xl text-lg text-[var(--color-text-secondary)]">
          {study.research_question}
        </p>
      )}

      <div className="mt-10">
        <UploadForm studyId={study.id} />
      </div>

      <section className="mt-12">
        <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
          Interviews
        </h2>
        <div className="mt-4">
          <InterviewList studyId={study.id} initial={interviews} />
        </div>
      </section>

      <p className="mt-16 font-mono text-xs text-[var(--color-text-tertiary)]">
        Day 2 placeholder. Interview detail pages and cross-interview themes ship Day 4 to 5.
      </p>
    </main>
  );
}
