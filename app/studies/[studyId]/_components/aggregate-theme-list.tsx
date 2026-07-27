'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AggregateDrillDownEntry {
  interview_id: string;
  interview_filename: string;
  source_theme_name: string;
  quote: string;
}

export interface AggregateThemeRow {
  id: string;
  name: string;
  description: string | null;
  frequency: number | null;
  drillDown: AggregateDrillDownEntry[];
}

interface Props {
  studyId: string;
  rows: AggregateThemeRow[];
}

export function AggregateThemeList({ studyId, rows }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resyncPending, setResyncPending] = useState(false);
  const [resyncError, setResyncError] = useState<string | null>(null);

  function toggle(themeId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(themeId)) {
        next.delete(themeId);
      } else {
        next.add(themeId);
      }
      return next;
    });
  }

  async function onResync() {
    setResyncPending(true);
    setResyncError(null);
    try {
      const res = await fetch(`/api/studies/${studyId}/synthesize`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Re-synthesis failed (${res.status})`);
      }
      router.refresh();
      // Reset pending: router.refresh() re-renders this component with fresh
      // server data but does NOT unmount it, so we own the state reset.
      setResyncPending(false);
    } catch (err) {
      setResyncError(err instanceof Error ? err.message : 'Re-synthesis failed.');
      setResyncPending(false);
    }
  }

  return (
    <section className="mt-10">
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="t-eyebrow text-[var(--color-text-secondary)]">
          {rows.length} aggregate {rows.length === 1 ? 'theme' : 'themes'}
        </p>
        <button
          type="button"
          onClick={onResync}
          disabled={resyncPending}
          className="t-body-m rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 py-2 text-[var(--color-text-primary)] transition-colors duration-200 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resyncPending ? 'Synthesizing…' : 'Re-synthesize'}
        </button>
      </div>

      {resyncError && (
        <p className="t-body-m mb-4 text-[var(--color-error)]" role="alert">
          {resyncError}
        </p>
      )}

      <ul
        className={`space-y-4 transition-opacity duration-200 ${resyncPending ? 'opacity-50' : 'opacity-100'}`}
      >
        {rows.map((theme) => {
          const isExpanded = expanded.has(theme.id);
          const drillCount = theme.drillDown.length;

          return (
            <li
              key={theme.id}
              className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6"
            >
              <button
                type="button"
                onClick={() => toggle(theme.id)}
                aria-expanded={isExpanded}
                className="flex w-full items-baseline justify-between gap-4 text-left transition-opacity hover:opacity-80"
              >
                <h3 className="t-display-2 text-[var(--color-text-primary)]">{theme.name}</h3>
                <span
                  className="t-eyebrow shrink-0 rounded-full bg-[var(--color-bg-subtle)] px-3 py-1 text-[var(--color-text-secondary)]"
                  title={`${theme.frequency ?? 0} interviews, ${drillCount} source quotes`}
                >
                  {theme.frequency ?? 0} {theme.frequency === 1 ? 'interview' : 'interviews'}
                </span>
              </button>

              {theme.description ? (
                <p className="t-body-l mt-3 text-[var(--color-text-secondary)]">
                  {theme.description}
                </p>
              ) : null}

              {isExpanded ? (
                drillCount > 0 ? (
                  <div className="mt-6 space-y-5 border-t border-[var(--color-border-subtle)] pt-5">
                    {theme.drillDown.map((entry, i) => (
                      <div key={`${theme.id}-${entry.interview_id}-${i}`}>
                        <p className="t-eyebrow text-[var(--color-text-secondary)]">
                          {entry.interview_filename} · original theme: {entry.source_theme_name}
                        </p>
                        <p className="t-italic-stat mt-2 border-l-2 border-[var(--color-accent)] pl-4 text-[var(--color-text-primary)]">
                          &ldquo;{entry.quote}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="t-body-m mt-6 border-t border-[var(--color-border-subtle)] pt-5 text-[var(--color-text-tertiary)]">
                    Source quotes unavailable.
                  </p>
                )
              ) : (
                <p className="t-code mt-4 text-[var(--color-text-tertiary)]">
                  Tap to see source quotes from {drillCount}{' '}
                  {drillCount === 1 ? 'interview' : 'interviews'}.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
