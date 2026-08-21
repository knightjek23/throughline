'use client';

/**
 * CSV import, in Dovetail's export shape.
 *
 * The preview before submit is the point. An import can create fifty
 * interviews and fifty analysis runs, so the researcher sees the row count and
 * the titles first and presses a button that names the number.
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  studyId: string;
}

interface SkippedRow {
  row: number;
  title: string;
  reason: string;
}

interface ImportResponse {
  imported: number;
  skipped: SkippedRow[];
  failed: Array<{ title: string; reason: string }>;
  totalRows: number;
}

interface ApiErrorResponse {
  error: string;
}

const MAX_ROWS = 50;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Row count only. Enough to preview and to catch an over-cap file before the
 * upload, without reimplementing the parser in the browser: the server is the
 * authority on what actually parses.
 */
function countDataRows(text: string): number {
  let rows = 0;
  let inQuotes = false;
  let sawContent = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
      continue;
    }
    if (char === '\n' && !inQuotes) {
      if (sawContent) rows++;
      sawContent = false;
      continue;
    }
    if (char !== '\r' && char.trim() !== '') sawContent = true;
  }
  if (sawContent) rows++;

  return Math.max(0, rows - 1); // drop the header row
}

export function ImportForm({ studyId }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const overCap = rowCount !== null && rowCount > MAX_ROWS;

  async function onPick(files: FileList | null) {
    setError(null);
    setResult(null);
    setRowCount(null);
    setFile(null);

    const picked = files?.[0];
    if (!picked) return;

    if (picked.size > MAX_BYTES) {
      setError('That file is over the 10 MB limit.');
      return;
    }
    if (!picked.name.toLowerCase().endsWith('.csv')) {
      setError('Import expects a .csv file. Use Upload for a single transcript.');
      return;
    }

    setFile(picked);
    setRowCount(countDataRows(await picked.text()));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || overCap || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(`/api/studies/${studyId}/import`, { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          res.status === 429
            ? 'Too many imports recently. Try again in a few minutes.'
            : (body as ApiErrorResponse).error || `Import failed (${res.status})`,
        );
        return;
      }

      setResult(body as ImportResponse);
      setFile(null);
      setRowCount(null);
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    } catch {
      setError('Something went wrong on our end. Wait a moment and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 className="t-display-3 text-[var(--color-text-primary)]">Import a CSV</h2>
      <p className="t-body-m mt-2 text-[var(--color-text-secondary)]">
        Drop a CSV export. Dovetail exports work as-is. Up to {MAX_ROWS} interviews per import.
      </p>

      <label htmlFor="import-file" className="sr-only">
        CSV file
      </label>
      <input
        ref={inputRef}
        id="import-file"
        type="file"
        accept=".csv,text/csv"
        disabled={submitting}
        onChange={(event) => onPick(event.target.files)}
        className="t-body-m mt-6 block max-w-md cursor-pointer text-[var(--color-text-secondary)] file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-[var(--color-accent)] file:px-4 file:py-2 file:text-[var(--color-bg-base)] file:transition-colors hover:file:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      />

      {rowCount !== null && !overCap ? (
        <p className="t-body-m ku-num mt-4 text-[var(--color-text-secondary)]">
          {rowCount} {rowCount === 1 ? 'interview' : 'interviews'} found. Titles come from the Title
          column.
        </p>
      ) : null}

      {overCap ? (
        <p className="t-body-m ku-num mt-4 text-[var(--color-error)]" role="alert">
          That file has {rowCount} rows and the limit is {MAX_ROWS} per import. Split it and import
          in batches.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!file || overCap || submitting}
        className="ku-press t-body-m mt-6 rounded-md bg-[var(--color-accent)] px-6 py-2 text-[var(--color-bg-base)] transition-colors duration-[var(--ku-dur-hover)] hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting
          ? 'Importing…'
          : rowCount && !overCap
            ? `Import ${rowCount} ${rowCount === 1 ? 'interview' : 'interviews'}`
            : 'Import'}
      </button>

      {error && (
        <p className="t-body-m mt-4 text-[var(--color-error)]" role="alert">
          {error}
        </p>
      )}

      {result ? (
        <div className="mt-6 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-base)] p-4" role="status">
          <p className="t-body-m ku-num text-[var(--color-text-primary)]">
            Imported {result.imported} of {result.totalRows}.
          </p>

          {result.skipped.length > 0 ? (
            <>
              <p className="t-eyebrow mt-4 text-[var(--color-text-secondary)]">Skipped</p>
              <ul className="mt-2 space-y-2">
                {result.skipped.map((row) => (
                  <li key={row.row} className="t-code text-[var(--color-text-tertiary)]">
                    {row.title}: {row.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {result.failed.length > 0 ? (
            <>
              <p className="t-eyebrow mt-4 text-[var(--color-error)]">Couldn&rsquo;t be saved</p>
              <ul className="mt-2 space-y-2">
                {result.failed.map((row, index) => (
                  <li key={`${row.title}-${index}`} className="t-code text-[var(--color-text-tertiary)]">
                    {row.title}: {row.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
