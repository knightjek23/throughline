/**
 * QStash wrapper. Routes enqueue jobs through this; QStash hits target routes
 * which run inside Vercel functions configured for up to 800s (Vercel Pro).
 *
 * Job targets verify the request signature with `verifySignature()` before
 * doing any work. Never trust an unsigned request.
 */

import 'server-only';
import { Client, Receiver } from '@upstash/qstash';

const client = new Client({ token: process.env.QSTASH_TOKEN! });

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export type JobName = 'analyze-interview' | 'synthesize-study';

export interface EnqueueArgs<T> {
  job: JobName;
  payload: T;
  // Defer execution — useful for debouncing aggregate synthesis.
  delaySeconds?: number;
}

export async function enqueue<T>({ job, payload, delaySeconds }: EnqueueArgs<T>) {
  const targetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/${job}`;
  return client.publishJSON({
    url: targetUrl,
    body: payload,
    delay: delaySeconds,
    retries: 2,
  });
}

export async function verifyJobRequest(req: Request): Promise<boolean> {
  const signature = req.headers.get('upstash-signature');
  if (!signature) return false;
  const body = await req.clone().text();
  try {
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}
