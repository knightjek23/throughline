'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  studyId: string;
}

interface ApiErrorResponse {
  error: string;
  details?: unknown;
}

const ACCEPT = '.txt,text/plain';
const MAX_BYTES = 10 * 1024 * 1024;

export function UploadForm({ studyId }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setError(null);

    if (file.size > MAX_BYTES) {
      setError('File exceeds the 10 MB limit.');
      return;
    }
    if (file.type !== 'text/plain' && !file.name.toLowerCase().endsWith('.txt')) {
      setError('Only .txt transcripts are supported in v0. VTT, SRT, and DOCX come next.');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(`/api/studies/${studyId}/interviews`, {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorResponse;
        const message =
          res.status === 429
            ? 'Too many uploads recently. Try again in a few minutes.'
            : res.status === 413
              ? 'File too large.'
              : res.status === 415
                ? 'Unsupported file type.'
                : body.error || `Upload failed (${res.status})`;
        setError(message);
        return;
      }

      // Clear input + refresh so the new queued row shows up immediately.
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] p-6">
      <h2 className="t-display-3 text-[var(--color-text-primary)]">Upload a transcript</h2>
      <p className="t-body-m mt-1 text-[var(--color-text-secondary)]">
        Plain text only for now. We&apos;ll queue it for analysis and surface themes and quotes
        within ~10 seconds.
      </p>

      <div className="mt-5 flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          disabled={submitting}
          onChange={(e) => handleFiles(e.target.files)}
          className="t-body-m block max-w-md cursor-pointer text-[var(--color-text-secondary)] file:mr-4 file:rounded-md file:border-0 file:bg-[var(--color-accent)] file:px-4 file:py-2 file:text-[var(--color-bg-base)] file:transition-colors hover:file:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        />
        {submitting && (
          <span className="t-code text-[var(--color-text-secondary)]">Uploading…</span>
        )}
      </div>

      {error && (
        <p className="t-body-m mt-3 text-[var(--color-error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
