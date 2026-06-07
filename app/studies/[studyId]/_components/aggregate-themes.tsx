/**
 * Server component that fetches and renders aggregate cross-study themes
 * for a given study. Read-only in Day 4: theme editing, archiving, and
 * drill-down to source quotes ship Day 5 / v1.1.
 *
 * Data shape: study_themes is one row per aggregate theme (not a single
 * JSON blob), ordered by frequency desc so dominant themes surface first.
 */

import { createServerClient } from '@/lib/supabase/server';

interface Props {
  studyId: string;
}

export async function AggregateThemes({ studyId }: Props) {
  const supabase = await createServerClient();

  const { data: themes } = await supabase
    .from('study_themes')
    .select('id, name, description, frequency, source_quote_refs')
    .eq('study_id', studyId)
    .order('frequency', { ascending: false });

  const rows = themes ?? [];

  if (rows.length === 0) {
    return (
      <section className="mt-10 rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] p-8">
        <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
          No aggregate yet
        </h2>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          Cross-interview themes appear here after three interviews finish analysis. Upload one
          more and Throughline will dedup themes across the study automatically.
        </p>
      </section>
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
                <h3 className="font-display text-2xl tracking-tight text-[var(--color-text-primary)]">
                  {theme.name}
                </h3>
                <span
                  className="shrink-0 rounded-full bg-[var(--color-bg-subtle)] px-3 py-1 font-mono text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]"
                  title={`${theme.frequency ?? 0} interviews, ${refCount} source quotes`}
                >
                  {theme.frequency ?? 0} {theme.frequency === 1 ? 'interview' : 'interviews'}
                </span>
              </div>
              {theme.description ? (
                <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)]">
                  {theme.description}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-10 font-mono text-xs text-[var(--color-text-tertiary)]">
        Tap to drill into source quotes per theme ships next.
      </p>
    </section>
  );
}
