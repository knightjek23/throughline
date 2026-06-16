'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  studyId: string;
  analyzedInterviewCount: number;
  minInterviews: number;
}

export function SynthesizeCTA({ studyId, analyzedInterviewCount, minInterviews }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSynthesize = analyzedInterviewCount >= minInterviews;

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/studies/${studyId}/synthesize`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Synthesis failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synthesis failed.');
      setPending(false);
    }
  }

  if (!canSynthesize) {
    const needed = minInterviews - analyzedInterviewCount;
    return (
      <section className="mt-10 rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] p-8">
        <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
          Aggregate not ready
        </h2>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          Upload {needed} more interview{needed === 1 ? '' : 's'} to unlock cross-study synthesis.
          Throughline needs at least {minInterviews} analyzed interviews to find themes that
          repeat across them.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-8">
      <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
        Ready to synthesize
      </h2>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--color-text-secondary)]">
        You have {analyzedInterviewCount} analyzed interviews. Run synthesis to dedup themes
        across all of them with frequency counts.
      </p>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="rounded-md bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-[var(--color-bg-base)] transition-colors duration-200 hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Synthesizing…' : 'Synthesize aggregate themes'}
        </button>
        {pending && (
          <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
            This usually takes 30 to 60 seconds. Keep this tab open.
          </span>
        )}
      </div>

      {error && (
        <p className="mt-4 text-sm text-[var(--color-error)]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
