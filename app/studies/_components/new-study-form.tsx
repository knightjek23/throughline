'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ApiStudyResponse {
  id: string;
  name: string;
  research_question: string | null;
  status: string;
  created_at: string;
}

interface ApiErrorResponse {
  error: string;
  details?: unknown;
}

export function NewStudyForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [researchQuestion, setResearchQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/studies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          research_question: researchQuestion.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorResponse;
        setError(
          res.status === 429
            ? 'Too many studies created recently. Try again in a few minutes.'
            : body.error || `Request failed (${res.status})`,
        );
        return;
      }

      const created = (await res.json()) as ApiStudyResponse;
      setName('');
      setResearchQuestion('');
      router.push(`/studies/${created.id}`);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6"
    >
      <h2 className="t-display-2 text-[var(--color-text-primary)]">New study</h2>
      <p className="t-body-m mt-1 text-[var(--color-text-secondary)]">
        Name the study and write the research question driving it.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="t-body-m text-[var(--color-text-primary)]">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            placeholder="Q2 onboarding interviews"
            className="t-body-m mt-1.5 block w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-3 py-2 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-2 focus:outline-offset-[-1px] focus:outline-[var(--color-accent)]"
          />
        </label>

        <label className="block">
          <span className="t-body-m text-[var(--color-text-primary)]">
            Research question <span className="text-[var(--color-text-tertiary)]">(optional)</span>
          </span>
          <textarea
            value={researchQuestion}
            onChange={(e) => setResearchQuestion(e.target.value)}
            maxLength={280}
            rows={3}
            placeholder="What's blocking new users from completing onboarding?"
            className="t-body-m mt-1.5 block w-full resize-none rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-3 py-2 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-2 focus:outline-offset-[-1px] focus:outline-[var(--color-accent)]"
          />
        </label>
      </div>

      {error && (
        <p className="t-body-m mt-4 text-[var(--color-error)]" role="alert">
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="t-body-m rounded-md bg-[var(--color-accent)] px-4 py-2 text-[var(--color-bg-base)] transition-colors duration-200 hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create study'}
        </button>
      </div>
    </form>
  );
}
