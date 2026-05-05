'use client';

/**
 * Client-side providers. PostHog is initialized once on first mount.
 * The page-view event is captured automatically via PostHog's autocapture +
 * Next.js router events — no manual tracking needed for $pageview.
 */

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return; // skip in dev / preview without keys

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      capture_pageview: 'history_change',
      capture_pageleave: true,
      person_profiles: 'identified_only',
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
