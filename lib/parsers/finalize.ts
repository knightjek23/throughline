import 'server-only';
import type { ParseResult } from './index';

/** Sanity cap, roughly 80k words. Also the ceiling the evidence spine was
 *  measured against: 500,000 chars segments in 12ms. */
export const MAX_TRANSCRIPT_CHARS = 500_000;

/** Below this there is not enough material for the model to find themes in. */
export const MIN_TRANSCRIPT_WORDS = 50;

/**
 * The last step of every single-transcript parser. Normalizes line endings,
 * applies the two size guards, and counts words.
 *
 * Shared so the limits cannot drift between formats: a .txt and a .vtt of the
 * same length must be accepted or rejected identically, or the rules become
 * a property of the file extension rather than of the product.
 */
export function finalize(text: string): ParseResult {
  const raw = text.replace(/\r\n/g, '\n').trim();
  if (!raw) throw new Error('empty transcript');
  if (raw.length > MAX_TRANSCRIPT_CHARS) {
    throw new Error(`transcript exceeds ${MAX_TRANSCRIPT_CHARS} chars`);
  }
  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_TRANSCRIPT_WORDS) {
    throw new Error(`transcript too short to analyze (<${MIN_TRANSCRIPT_WORDS} words)`);
  }
  return { text: raw, wordCount };
}
