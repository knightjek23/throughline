'use client';

/**
 * Paste a transcript straight in, without saving a file first.
 *
 * No repository vendor documents a paste path, which makes this small and real
 * on a tool aimed at solo researchers. Server-side it writes a .txt to storage
 * and follows the identical route as an upload, so nothing downstream has to
 * know the difference.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  studyId: string;
}

interface ApiErrorResponse {
  error: string;
}

const MIN_WORDS = 50;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function PasteForm({ studyId }: Props) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const words = countWords(text);
  const tooShort = words > 0 && words < MIN_WORDS;
  const canSubmit = words >= MIN_WORDS && !submitting;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('text', text);
      if (name.trim()) fd.append('name', name.trim());

      const res = await fetch(`/api/studies/${studyId}/interviews`, { method: 'POST', body: fd });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorResponse;
        setError(
          res.status === 429
            ? 'Too many uploads recently. Try again in a few minutes.'
            : body.error || `Couldn't add that transcript (${res.status})`,
        );
        return;
      }

      setText('');
      setName('');
      router.refresh();
    } catch {
      setError('Something went wrong on our end. Wait a moment and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 className="t-display-3 text-[var(--color-text-primary)]">Paste a transcript</h2>
      <p className="t-body-m mt-2 text-[var(--color-text-secondary)]">
        Analysis usually takes 30 to 60 seconds.
      </p>

      <label htmlFor="paste-text" className="sr-only">
        Transcript text
      </label>
      <textarea
        id="paste-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={submitting}
        rows={10}
        placeholder={'Paste your transcript. Speaker labels like "Interviewer:" are kept.'}
        aria-describedby="paste-count"
        className="t-body-m mt-6 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-base)] p-4 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus-visible:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
      />

      <p
        id="paste-count"
        className={`t-code ku-num mt-2 ${tooShort ? 'text-[var(--color-error)]' : 'text-[var(--color-text-tertiary)]'}`}
        role={tooShort ? 'alert' : undefined}
      >
        {tooShort
          ? `Transcripts need at least ${MIN_WORDS} words to analyze. That's ${words} so far.`
          : `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`}
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div className="min-w-64 flex-1">
          <label htmlFor="paste-name" className="t-eyebrow block text-[var(--color-text-secondary)]">
            Name this transcript
          </label>
          <input
            id="paste-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={submitting}
            maxLength={120}
            placeholder="Optional"
            className="t-body-m mt-2 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-4 py-2 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus-visible:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="ku-press t-body-m cta-hover rounded-md bg-[var(--color-accent)] px-6 py-2 text-[var(--color-bg-base)] transition-colors duration-[var(--ku-dur-hover)] hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Adding…' : 'Analyze transcript'}
        </button>
      </div>

      {error && (
        <p className="t-body-m mt-4 text-[var(--color-error)]" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
