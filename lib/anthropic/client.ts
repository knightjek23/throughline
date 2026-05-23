/**
 * Singleton Anthropic client + retry helper. All routes go through
 * analyze() / synthesize(), no raw `client.messages.create` outside
 * this folder. `withRetry()` wraps any Anthropic call and retries
 * once on 5xx or network errors. Hard errors (4xx, 429) surface
 * immediately so we don't burn the second attempt on something that
 * will fail the same way.
 */

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { ApiRetryExhaustedError } from './errors';

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (cached) return cached;
  cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cached;
}

export const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

/**
 * Returns true if an error is worth retrying once. Treats:
 *  - Anything without a numeric `.status` as a network/transport failure
 *  - HTTP 5xx as transient server-side failure
 * Everything else (4xx including 429) is a hard error: don't retry.
 *
 * We treat 429 as a hard failure on purpose. Per spec, the analyzer
 * runs as a background QStash job, not a tight loop; an immediate
 * second call would almost certainly hit the same limiter window.
 */
function isRetryable(err: unknown): boolean {
  if (err === null || err === undefined || typeof err !== 'object') return true;
  const status = (err as { status?: unknown }).status;
  if (typeof status !== 'number') return true;
  return status >= 500 && status < 600;
}

/**
 * Calls `fn` at most twice. On the second consecutive retry-eligible
 * failure, throws `ApiRetryExhaustedError` with the last error preserved
 * as `cause`. Non-retryable errors propagate as-is on either attempt.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (firstErr) {
    if (!isRetryable(firstErr)) throw firstErr;
    try {
      return await fn();
    } catch (secondErr) {
      if (!isRetryable(secondErr)) throw secondErr;
      throw new ApiRetryExhaustedError(secondErr);
    }
  }
}
