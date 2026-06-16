/**
 * /studies/[studyId] - study detail page with Interviews and Aggregate tabs.
 *
 * Day 4: ships the tabbed layout. Aggregate tab reads from study_themes.
 * Tabs are URL-driven via `?tab=` so each is deep-linkable and the page
 * only fetches the data it needs to render the active tab.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ensureUser } from '@/lib/users';
import { createServerClient } from '@/lib/supabase/server';
import { UploadForm } from './_components/upload-form';
import { InterviewList, type InterviewRow } from './_components/interview-list';
import { TabBar, type StudyTab } from './_components/tab-bar';
import { AggregateThemes } from './_components/aggregate-themes';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ studyId: string }>;
  searchParams: Promise<{ tab?: string }>;
}

function parseTab(raw: string | undefined): StudyTab {
  return raw === 'aggregate' ? 'aggregate' : 'interviews';
}

export default async function StudyDetailPage({ params, searchParams }: PageProps) {
  const { studyId } = await params;
  const { tab } = await searchParams;
  const activeTab = parseTab(tab);
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

  // Always fetch interview list + aggregate count so the tab bar can show
  // counts on both tabs regardless of which one is active. The full
  // aggregate theme rows only get fetched when the Aggregate tab renders.
  const [interviewsResult, aggregateCountResult] = await Promise.all([
    supabase
      .from('interviews')
      .select('id, filename, status, word_count, uploaded_at, analyzed_at, failure_reason')
      .eq('study_id', studyId)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('study_themes')
      .select('id', { count: 'exact', head: true })
      .eq('study_id', studyId),
  ]);

  const interviews: InterviewRow[] = (interviewsResult.data ?? []) as InterviewRow[];
  const aggregateThemeCount = aggregateCountResult.count ?? 0;
  const analyzedInterviewCount = interviews.filter((iv) => iv.status === 'analyzed').length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/studies"
        className="t-eyebrow text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        ← Studies
      </Link>

      <h1 className="t-display-1 mt-4 text-[var(--color-text-primary)]">{study.name}</h1>
      {study.research_question && (
        <p className="t-subhead mt-3 max-w-2xl text-[var(--color-text-secondary)]">
          {study.research_question}
        </p>
      )}

      <TabBar
        studyId={study.id}
        activeTab={activeTab}
        interviewCount={interviews.length}
        aggregateThemeCount={aggregateThemeCount}
      />

      {activeTab === 'interviews' ? (
        <>
          <div className="mt-10">
            <UploadForm studyId={study.id} />
          </div>

          <section className="mt-10">
            <InterviewList studyId={study.id} initial={interviews} />
          </section>
        </>
      ) : (
        <AggregateThemes
          studyId={study.id}
          analyzedInterviewCount={analyzedInterviewCount}
        />
      )}
    </main>
  );
}
