/**
 * Word-count-based token estimator and the 40k-token length gate.
 *
 * Why a heuristic: Anthropic's real tokenizer is BPE and we'd need to ship
 * the tokenizer binary into the function bundle to use it. The 40k ceiling
 * is a soft v1 boundary (chunking lands in v1.1), so being ~10% over-
 * conservative is the correct safety bias: we fail-loud slightly before
 * the API would reject us, never after.
 *
 * Pure logic, no I/O. Safe to import from anywhere (server or client) if
 * we ever want client-side pre-validation before upload.
 */

import { TooLongError } from './errors';

/** Maximum estimated tokens per single Anthropic call. v1 ceiling per spec. */
export const MAX_TOKENS = 40_000;

/** Rough words-to-tokens conversion. English research transcripts run ~1.3 tokens/word. */
const TOKENS_PER_WORD = 1.3;

/**
 * Estimates token count by splitting on any whitespace, dropping empty
 * entries (so double-spaces don't double-count), and applying the
 * tokens-per-word ratio. Ceiling-rounds to over-estimate at the boundary.
 */
export function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  return Math.ceil(words.length * TOKENS_PER_WORD);
}

/**
 * Throws TooLongError if the estimated token count exceeds MAX_TOKENS.
 * Called at the top of analyzeInterview before any prompt building or
 * API call so we never burn a token budget on an oversize transcript.
 */
export function assertWithinLimit(text: string): void {
  if (estimateTokens(text) > MAX_TOKENS) {
    throw new TooLongError();
  }
}
