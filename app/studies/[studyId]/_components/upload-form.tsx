'use client';

/**
 * The three ways into a study: upload a file, paste text, import a CSV.
 *
 * Tabs are local state rather than URL state. This is a control on a page, not
 * a destination, and putting it in the URL would put a tab switch in the
 * browser history between two real navigations.
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PasteForm } from './paste-form';
import { ImportForm } from './import-form';

interface Props {
  studyId: string;
}

interface ApiErrorResponse {
  error: string;
  details?: unknown;
}

type Tab = 'upload' | 'paste' | 'import';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'upload', label: 'Upload' },
  { key: 'paste', label: 'Paste' },
  { key: 'import', label: 'Import' },
];

const ACCEPT = '.txt,.vtt,.srt,.docx';
const MAX_BYTES = 10 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ['txt', 'vtt', 'srt', 'docx'];

export function UploadForm({ studyId }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [tab, setTab] = useState<Tab>('upload');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onTabKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : (index - 1 + TABS.length) % TABS.length;
    setTab(TABS[next].key);
    tabRefs.current[next]?.focus();
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setError(null);

    if (file.size > MAX_BYTES) {
      setError('That file is over the 10 MB limit.');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (extension === 'csv') {
      setError('That looks like a CSV. Use Import to bring in several interviews at once.');
      return;
    }
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      setError('Throughline reads .txt, .vtt, .srt, .docx and .csv files.');
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
              ? 'That file is over the 10 MB limit.'
              : body.error || `Upload failed (${res.status})`;
        setError(message);
        return;
      }

      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    } catch {
      setError('Something went wrong on our end. Wait a moment and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] p-6">
      <div
        role="tablist"
        aria-label="How to add a transcript"
        className="flex gap-2 border-b border-[var(--color-border-subtle)] pb-4"
      >
        {TABS.map((entry, index) => (
          <button
            key={entry.key}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            role="tab"
            id={`add-tab-${entry.key}`}
            aria-selected={tab === entry.key}
            aria-controls={`add-panel-${entry.key}`}
            tabIndex={tab === entry.key ? 0 : -1}
            onClick={() => setTab(entry.key)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            className={`t-eyebrow ku-press rounded-md px-4 py-2 transition-colors duration-[var(--ku-dur-hover)] ${
              tab === entry.key
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'upload' ? (
        <div role="tabpanel" id="add-panel-upload" aria-labelledby="add-tab-upload" className="mt-6">
          <h2 className="t-display-3 text-[var(--color-text-primary)]">Upload a transcript</h2>
          <p className="t-body-m mt-2 text-[var(--color-text-secondary)]">
            Plain text, captions or a Word document. Analysis usually takes 30 to 60 seconds.
          </p>

          <div className="mt-6 flex items-center gap-4">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              disabled={submitting}
              onChange={(e) => handleFiles(e.target.files)}
              className="t-body-m block max-w-md cursor-pointer text-[var(--color-text-secondary)] file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-[var(--color-accent)] file:px-4 file:py-2 file:text-[var(--color-bg-base)] file:transition-colors hover:file:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            />
            {submitting && <span className="t-code text-[var(--color-text-secondary)]">Uploading…</span>}
          </div>

          {error && (
            <p className="t-body-m mt-4 text-[var(--color-error)]" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : null}

      {tab === 'paste' ? (
        <div role="tabpanel" id="add-panel-paste" aria-labelledby="add-tab-paste" className="mt-6">
          <PasteForm studyId={studyId} />
        </div>
      ) : null}

      {tab === 'import' ? (
        <div role="tabpanel" id="add-panel-import" aria-labelledby="add-tab-import" className="mt-6">
          <ImportForm studyId={studyId} />
        </div>
      ) : null}
    </div>
  );
}
