/**
 * Day 3 Task 7 tests: failureReason() error-to-string mapping.
 *
 * Every known error class carries its user-facing copy in `err.message`
 * already (by design — see lib/anthropic/errors.ts), so the helper just
 * passes those through. Unknown errors get a truncate-and-fallback path
 * so we don't leak 5KB Anthropic stack traces into the UI.
 */

import { describe, it, expect } from 'vitest';
import { failureReason } from '@/lib/anthropic/failure-reason';
import {
  TooLongError,
  ApiRetryExhaustedError,
  InvalidAnalysisFormatError,
  NoGroundedThemesError,
} from '@/lib/anthropic/errors';

describe('failureReason — known error classes', () => {
  it('maps TooLongError to the spec failure_reason', () => {
    expect(failureReason(new TooLongError())).toBe(
      'Transcript too long. Max 40k tokens, about 30k words.',
    );
  });

  it('maps ApiRetryExhaustedError to the spec failure_reason', () => {
    expect(failureReason(new ApiRetryExhaustedError(new Error('upstream 504')))).toBe(
      'Anthropic API failed after retry.',
    );
  });

  it('maps InvalidAnalysisFormatError to the spec failure_reason', () => {
    expect(failureReason(new InvalidAnalysisFormatError())).toBe(
      'Analysis returned invalid format.',
    );
  });

  it('maps NoGroundedThemesError to the spec failure_reason', () => {
    expect(failureReason(new NoGroundedThemesError())).toBe(
      'Analysis returned no grounded themes.',
    );
  });
});

describe('failureReason — unknown errors', () => {
  it('passes through a short Error.message as-is', () => {
    expect(failureReason(new Error('Anthropic rejected the tool schema'))).toBe(
      'Anthropic rejected the tool schema',
    );
  });

  it('truncates Error.message longer than 200 chars and adds an ellipsis', () => {
    const longMsg = 'x'.repeat(500);
    const result = failureReason(new Error(longMsg));
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith('...')).toBe(true);
  });

  it('returns "unknown error" when the value is not an Error', () => {
    expect(failureReason('plain string')).toBe('unknown error');
    expect(failureReason(null)).toBe('unknown error');
    expect(failureReason(undefined)).toBe('unknown error');
    expect(failureReason({ random: 'object' })).toBe('unknown error');
  });

  it('returns "unknown error" when Error.message is empty', () => {
    expect(failureReason(new Error(''))).toBe('unknown error');
  });
});
