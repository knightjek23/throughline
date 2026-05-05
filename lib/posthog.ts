/**
 * Server-side PostHog event tracker. Use for events that fire from background
 * jobs and webhooks where the browser SDK isn't available — interview_analyzed,
 * aggregate_synthesized, upgraded, etc.
 *
 * The roadmap §4 event list:
 *   study_created, interview_uploaded, interview_analyzed, interview_failed,
 *   aggregate_synthesized, export_generated, upgraded
 */

import 'server-only';
import { PostHog } from 'posthog-node';

let cached: PostHog | null = null;

function getPostHog(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (cached) return cached;
  cached = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    flushAt: 1, // ship every event immediately — Vercel functions die fast
    flushInterval: 0,
  });
  return cached;
}

export type TrackedEvent =
  | 'study_created'
  | 'interview_uploaded'
  | 'interview_analyzed'
  | 'interview_failed'
  | 'aggregate_synthesized'
  | 'export_generated'
  | 'upgraded';

export async function track(
  event: TrackedEvent,
  userId: string,
  properties?: Record<string, unknown>,
) {
  const ph = getPostHog();
  if (!ph) return;
  ph.capture({ distinctId: userId, event, properties });
  // Force flush — server runtimes don't get a graceful shutdown.
  await ph.shutdown().catch(() => {
    /* swallow — analytics shouldn't fail user requests */
  });
}
