'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export type InterviewStatus = 'queued' | 'processing' | 'analyzed' | 'failed';

interface Props {
  studyId: string;
  interviewId: string;
  initialStatus: InterviewStatus;
  children: React.ReactNode;
}

interface StatusResponse {
  status: InterviewStatus;
  failure_reason: string | null;
}

const POLL_INTERVAL_MS = 2500;
const IN_FLIGHT: ReadonlySet<InterviewStatus> = new Set(['queued', 'processing']);

/**
 * Wraps the server-rendered interview detail page. While the interview is
 * `queued` or `processing`, polls the tiny status endpoint every 2.5s. On
 * the first transition to `analyzed` or `failed`, fires `router.refresh()`
 * so the server re-fetches the analysis + re-renders. Then stops polling.
 *
 * Server-rendered children pass through unchanged. This component only
 * exists to trigger the refresh; it doesn't render its own UI.
 */
export function InterviewDetailPoller({
  studyId,
  interviewId,
  initialStatus,
  children,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<InterviewStatus>(initialStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/studies/${studyId}/interviews/${interviewId}/status`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const body = (await res.json()) as StatusResponse;
      setStatus((prev) => {
        if (prev !== body.status) {
          // First transition off in-flight — pull the full analysis.
          router.refresh();
        }
        return body.status;
      });
    } catch {
      /* swallow — try again next tick */
    }
  }, [studyId, interviewId, router]);

  useEffect(() => {
    if (!IN_FLIGHT.has(status)) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (intervalRef.current) return;

    const handle = setInterval(tick, POLL_INTERVAL_MS);
    intervalRef.current = handle;
    return () => {
      clearInterval(handle);
      intervalRef.current = null;
    };
  }, [status, tick]);

  return <>{children}</>;
}
