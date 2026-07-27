/**
 * QStash wrapper. Routes enqueue jobs through this; QStash hits target routes
 * which run inside Vercel functions configured for up to 800s (Vercel Pro).
 *
 * Local dev fallback: in development, calling QStash cloud doesn't work
 * because it can't reach localhost. So in dev we invoke the target route
 * directly via fetch with a bypass header. Production uses real QStash.
 *
 * Job targets verify the request signature with `verifyJobRequest()` before
 * doing any work. Never trust an unsigned request in production.
 */

import 'server-only';
import { Client, Receiver } from '@upstash/qstash';
import { logger } from './logger';

// Security: gate the dev bypass on NODE_ENV, not NEXT_PUBLIC_APP_ENV.
// NEXT_PUBLIC_* vars are client-exposed config, and a preview deploy with
// APP_ENV=development would have let anyone invoke /api/jobs/* with the
// bypass header. NODE_ENV is 'development' only under `next dev`.
const isDev = process.env.NODE_ENV === 'development';

// Lazy clients so missing env vars don't blow up module load in dev.
let cachedClient: Client | null = null;
let cachedReceiver: Receiver | null = null;

function getClient(): Client {
  if (cachedClient) return cachedClient;
  cachedClient = new Client({ token: process.env.QSTASH_TOKEN! });
  return cachedClient;
}

function getReceiver(): Receiver {
  if (cachedReceiver) return cachedReceiver;
  cachedReceiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  });
  return cachedReceiver;
}

export type JobName = 'analyze-interview';

export interface EnqueueArgs<T> {
  job: JobName;
  payload: T;
  /** Defer execution. Useful for debouncing aggregate synthesis. */
  delaySeconds?: number;
  /**
   * Coalesces concurrent enqueues with the same ID. QStash side-effect:
   * within the dedup window, only the first enqueue is delivered; later
   * enqueues with the same ID get the same messageId and no extra call.
   */
  deduplicationId?: string;
}

/**
 * Header the dev fallback sets so the target route can accept the call
 * without a real QStash signature. Production routes still require a real
 * signature; the bypass is checked only when NODE_ENV === 'development'.
 */
export const DEV_BYPASS_HEADER = 'x-throughline-dev-bypass';

export async function enqueue<T>({
  job,
  payload,
  delaySeconds,
  deduplicationId,
}: EnqueueArgs<T>) {
  const targetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/${job}`;

  if (isDev) {
    // Fire and forget. The target route runs in the same dev server process.
    // We don't await it so the upload response can return immediately, just
    // like production where QStash returns after enqueuing. Dev skips dedup;
    // the clobber risk is low and the DB upsert is last-write-wins.
    void fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [DEV_BYPASS_HEADER]: '1',
      },
      body: JSON.stringify(payload),
    }).catch((err) => {
      logger.error({ err, job }, 'dev qstash fallback fetch failed');
    });
    return { messageId: `dev-${Date.now()}` };
  }

  return getClient().publishJSON({
    url: targetUrl,
    body: payload,
    delay: delaySeconds,
    deduplicationId,
    retries: 2,
  });
}

/**
 * Verifies a request is from QStash (or, in dev, carries the bypass header).
 * Returns true only when the request can be trusted.
 */
export async function verifyJobRequest(req: Request): Promise<boolean> {
  // Dev bypass: skip signature verification when running locally.
  if (isDev && req.headers.get(DEV_BYPASS_HEADER) === '1') {
    return true;
  }

  const signature = req.headers.get('upstash-signature');
  if (!signature) return false;

  const body = await req.clone().text();
  try {
    return await getReceiver().verify({ signature, body });
  } catch {
    return false;
  }
}
