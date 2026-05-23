/**
 * Day 3 Task 2 tests: token estimator + 40k-token length gate.
 *
 * Heuristic: estimateTokens(text) = ceil(words * 1.3). Not exact (Anthropic's
 * real tokenizer is BPE) but the 40k gate is a soft ceiling, so being 10%
 * over-conservative is the correct safety bias. Over-estimating means we
 * fail-loud slightly before the API would reject us, which is fine.
 *
 * The error message is the user-facing failure_reason per spec, so it gets
 * surfaced directly by the job handler without needing a second translation.
 */

import { describe, it, expect } from 'vitest';
import { estimateTokens, assertWithinLimit, MAX_TOKENS } from '@/lib/anthropic/tokens';
import { TooLongError } from '@/lib/anthropic/errors';

function makeWords(count: number): string {
  return Array.from({ length: count }, (_, i) => `word${i}`).join(' ');
}

describe('estimateTokens()', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(estimateTokens('   \n\t  ')).toBe(0);
  });

  it('returns ceil(words * 1.3) for a single word', () => {
    // 1 * 1.3 = 1.3, ceil = 2
    expect(estimateTokens('hello')).toBe(2);
  });

  it('returns 130 for a 100-word transcript', () => {
    expect(estimateTokens(makeWords(100))).toBe(130);
  });

  it('handles multiple internal whitespace gracefully (no double-counting)', () => {
    // "a  b" should be 2 words, not 3
    expect(estimateTokens('a  b')).toBe(Math.ceil(2 * 1.3));
  });

  it('exposes MAX_TOKENS = 40_000 per spec', () => {
    expect(MAX_TOKENS).toBe(40_000);
  });
});

describe('assertWithinLimit()', () => {
  it('does not throw for an empty string', () => {
    expect(() => assertWithinLimit('')).not.toThrow();
  });

  it('does not throw for a 100-word transcript', () => {
    expect(() => assertWithinLimit(makeWords(100))).not.toThrow();
  });

  it('does not throw at the 30k-word boundary (~39k tokens, just under)', () => {
    // 30_000 * 1.3 = 39_000 tokens, ceil = 39_000. Within limit.
    expect(() => assertWithinLimit(makeWords(30_000))).not.toThrow();
  });

  it('throws TooLongError when estimated tokens exceed 40_000', () => {
    // 31_000 * 1.3 = 40_300, ceil = 40_300. Over limit.
    expect(() => assertWithinLimit(makeWords(31_000))).toThrow(TooLongError);
  });

  it('error message matches spec failure_reason', () => {
    try {
      assertWithinLimit(makeWords(31_000));
      expect.fail('expected TooLongError');
    } catch (err) {
      expect(err).toBeInstanceOf(TooLongError);
      expect((err as TooLongError).message).toBe(
        'Transcript too long. Max 40k tokens, about 30k words.',
      );
    }
  });
});
