/**
 * Server component that fetches and renders aggregate cross-study themes
 * for a given study. Read-only in Day 4: theme editing, archiving, and
 * drill-down to source quotes ship Day 5 / v1.1.
 *
 * Data shape: study_themes is one row per aggregate theme (not a single
 * JSON blob), ordered by frequency desc so dominant themes surface first.
 */

import { createServerClient } from '@/lib/supabase/server';
import { SynthesizeCTA } from './synthesize-cta';

const MIN_INTERVIEWS_FOR_SYNTHESIS = 3;

interface Props {
  studyId: string;
  analyzedInterviewCount: number;
}

export async function AggregateThemes({ studyId, analyzedInterviewCount }: Props) {
  const supabase = await createServerClient();

  const { data: themes } = await supabase
    .from('study_themes')
    .select('id, name, description, frequency, source_quote_refs')
    .eq('study_id', studyId)
    .order('frequency', { ascending: false });

  const rows = themes ?? [];

  if (rows.length === 0) {
    return (
      <SynthesizeCTA
        studyId={studyId}
        analyzedInterviewCount={analyzedInterviewCount}
        minInterviews={MIN_INTERVIEWS_FOR_SYNTHESIS}
      />
    );
  }

  return (
    <section className="mt-10">
      <ul className="space-y-4">
        {rows.map((theme) => {
          const refCount = Array.isArray(theme.source_quote_refs)
            ? theme.source_quote_refs.length
            : 0;
          return (
            <li
              key={theme.id}
              className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="t-display-2 text-[var(--color-text-primary)]">{theme.name}</h3>
                <span
                  className="t-eyebrow shrink-0 rounded-full bg-[var(--color-bg-subtle)] px-3 py-1 text-[var(--color-text-secondary)]"
                  title={`${theme.frequency ?? 0} interviews, ${refCount} source quotes`}
                >
                  {theme.frequency ?? 0} {theme.frequency === 1 ? 'interview' : 'interviews'}
                </span>
              </div>
              {theme.description ? (
                <p className="t-body-l mt-3 text-[var(--color-text-secondary)]">
                  {theme.description}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="t-code mt-10 text-[var(--color-text-tertiary)]">
        Re-synthesize after uploading more interviews. Drill-down to source quotes ships next.
      </p>
    </section>
  );
}
