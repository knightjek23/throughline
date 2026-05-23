/**
 * Day 3 Task 1 tests: withRetry() helper around Anthropic calls.
 *
 * Contract (per spec):
 *  - Retry once on transient failures (5xx or network errors without status)
 *  - Do NOT retry on 4xx (client errors) — fail loud, no wasted call
 *  - After 2 failed attempts, throw ApiRetryExhaustedError wrapping the last error
 *  - On success (first or second try), return the value
 *
 * The Anthropic SDK throws errors with a numeric `.status` property for HTTP
 * failures and bare errors (no status) for network problems. We duck-type
 * against `.status` so we don't have to instantiate SDK error classes in tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '@/lib/anthropic/client';
import { ApiRetryExhaustedError } from '@/lib/anthropic/errors';

function httpError(status: number, message = `HTTP ${status}`): Error {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

function networkError(message = 'fetch failed'): Error {
  // No `.status` property — mimics network / DNS / timeout failures.
  return new Error(message);
}

describe('withRetry()', () => {
  it('returns the value when the fn succeeds on the first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries once and returns when the second call succeeds (5xx)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries once and returns when the second call succeeds (network)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws ApiRetryExhaustedError after two 5xx failures', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(httpError(500))
      .mockRejectedValueOnce(httpError(502));
    await expect(withRetry(fn)).rejects.toBeInstanceOf(ApiRetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws ApiRetryExhaustedError after two network failures', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(networkError('ECONNRESET'))
      .mockRejectedValueOnce(networkError('socket hang up'));
    await expect(withRetry(fn)).rejects.toBeInstanceOf(ApiRetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on a 4xx and rethrows the original error', async () => {
    const original = httpError(400, 'bad request');
    const fn = vi.fn().mockRejectedValue(original);
    await expect(withRetry(fn)).rejects.toBe(original);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on a 429 either (would just fail again, surface immediately)', async () => {
    const original = httpError(429, 'rate limited');
    const fn = vi.fn().mockRejectedValue(original);
    await expect(withRetry(fn)).rejects.toBe(original);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('preserves the last error as the cause of ApiRetryExhaustedError', async () => {
    const last = httpError(504, 'gateway timeout');
    const fn = vi.fn().mockRejectedValueOnce(httpError(500)).mockRejectedValueOnce(last);
    try {
      await withRetry(fn);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRetryExhaustedError);
      expect((err as ApiRetryExhaustedError).cause).toBe(last);
    }
  });
});
