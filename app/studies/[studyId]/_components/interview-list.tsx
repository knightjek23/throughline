'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export type InterviewStatus = 'queued' | 'processing' | 'analyzed' | 'failed';

export interface InterviewRow {
  id: string;
  filename: string;
  status: InterviewStatus;
  word_count: number | null;
  uploaded_at: string;
  analyzed_at: string | null;
  failure_reason: string | null;
}

interface Props {
  studyId: string;
  initial: InterviewRow[];
}

const POLL_INTERVAL_MS = 2500;
const IN_FLIGHT: ReadonlySet<InterviewStatus> = new Set(['queued', 'processing']);

function anyInFlight(rows: InterviewRow[]): boolean {
  return rows.some((r) => IN_FLIGHT.has(r.status));
}

const STATUS_LABEL: Record<InterviewStatus, string> = {
  queued: 'Queued',
  processing: 'Processing',
  analyzed: 'Analyzed',
  failed: 'Failed',
};

const STATUS_STYLE: Record<InterviewStatus, string> = {
  queued: 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]',
  processing: 'bg-[#FBE9C1] text-[#7A5A0A]', // warm mustard wash
  analyzed: 'bg-[#D9E5CE] text-[#3F5530]', // soft olive
  failed: 'bg-[#F2D4CE] text-[#7A2E20]', // soft terracotta-red
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function InterviewList({ studyId, initial }: Props) {
  // The server render is the source of truth; polled rows are an overlay on top
  // of it. When a fresh server render arrives (router.refresh after an upload)
  // the overlay is dropped so the new rows win.
  //
  // This used to be `setRows(initial)` inside an effect, which is the pattern
  // react-hooks/set-state-in-effect flags: it commits a render, then immediately
  // schedules another. Comparing the prop against the last one seen and adjusting
  // during render is React's documented alternative. React discards the in-progress
  // render and retries with the new state before committing anything, so there is
  // no cascade and no flash of stale rows.
  const [polledRows, setPolledRows] = useState<InterviewRow[] | null>(null);
  const [lastServerRows, setLastServerRows] = useState(initial);
  const pollingRef = useRef(false);

  if (initial !== lastServerRows) {
    setLastServerRows(initial);
    setPolledRows(null);
  }

  const rows = polledRows ?? initial;

  const tick = useCallback(async () => {
    try {
      const res = await fetch(`/api/studies/${studyId}/interviews`, { cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as { interviews: InterviewRow[] };
      setPolledRows(body.interviews);
    } catch {
      /* swallow — try again on the next tick */
    }
  }, [studyId]);

  useEffect(() => {
    if (!anyInFlight(rows)) {
      pollingRef.current = false;
      return;
    }
    if (pollingRef.current) return;
    pollingRef.current = true;

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      pollingRef.current = false;
      clearInterval(interval);
    };
  }, [rows, tick]);

  if (rows.length === 0) {
    return (
      <p className="t-body-m text-[var(--color-text-tertiary)]">
        No interviews yet. Upload one above to see themes and quotes.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--color-border-subtle)] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/studies/${studyId}/interviews/${row.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 transition-colors duration-[var(--ku-dur-hover)] hover:bg-[var(--color-bg-subtle)]"
          >
            <div className="min-w-0 flex-1">
              <p className="t-body-l truncate text-[var(--color-text-primary)]">{row.filename}</p>
              <p className="t-code mt-0.5 text-[var(--color-text-tertiary)]">
                {row.word_count != null ? `${row.word_count.toLocaleString()} words · ` : ''}
                uploaded {relativeTime(row.uploaded_at)}
                {row.status === 'failed' && row.failure_reason ? ` · ${row.failure_reason}` : ''}
              </p>
            </div>
            <span
              className={`t-eyebrow shrink-0 rounded-full px-3 py-1 ${STATUS_STYLE[row.status]}`}
            >
              {STATUS_LABEL[row.status]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
