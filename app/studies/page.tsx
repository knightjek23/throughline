/**
 * /studies — list of the user's studies plus a create form.
 * Day 5 will add study filters, archive, sorting. For Day 2 we just need
 * the create + list flow so we can drive into the upload pipeline.
 */

import Link from 'next/link';
import { ensureUser } from '@/lib/users';
import { createServerClient } from '@/lib/supabase/server';
import { NewStudyForm } from './_components/new-study-form';

export const dynamic = 'force-dynamic';

interface StudyRow {
  id: string;
  name: string;
  research_question: string | null;
  created_at: string;
}

export default async function StudiesPage() {
  await ensureUser();

  const supabase = await createServerClient();
  const { data: studies } = await supabase
    .from('studies')
    .select('id, name, research_question, created_at')
    .order('created_at', { ascending: false });

  const list: StudyRow[] = studies ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
        Throughline
      </p>
      <h1 className="mt-6 font-display text-4xl tracking-tight text-[var(--color-text-primary)]">
        Studies
      </h1>
      <p className="mt-3 text-[var(--color-text-secondary)]">
        A study is a single research project. Drop interview transcripts inside and Throughline
        surfaces themes and quotes across them.
      </p>

      <div className="mt-10">
        <NewStudyForm />
      </div>

      <section className="mt-12">
        <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
          Your studies
        </h2>

        {list.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">
            No studies yet. Create one above to get started.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--color-border-subtle)] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
            {list.map((study) => (
              <li key={study.id}>
                <Link
                  href={`/studies/${study.id}`}
                  className="flex items-baseline justify-between gap-4 px-5 py-4 transition-colors duration-150 hover:bg-[var(--color-bg-subtle)]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg text-[var(--color-text-primary)]">
                      {study.name}
                    </p>
                    {study.research_question && (
                      <p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">
                        {study.research_question}
                      </p>
                    )}
                  </div>
                  <time
                    dateTime={study.created_at}
                    className="shrink-0 font-mono text-xs text-[var(--color-text-tertiary)]"
                  >
                    {new Date(study.created_at).toLocaleDateString()}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
