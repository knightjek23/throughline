import 'server-only';
import type { ParseResult } from './index';

const MAX_TRANSCRIPT_CHARS = 500_000; // sanity cap; ~80k words

export function parseTxt(buf: Buffer): ParseResult {
  const raw = buf.toString('utf8').replace(/\r\n/g, '\n').trim();
  if (!raw) throw new Error('empty transcript');
  if (raw.length > MAX_TRANSCRIPT_CHARS) {
    throw new Error(`transcript exceeds ${MAX_TRANSCRIPT_CHARS} chars`);
  }
  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  if (wordCount < 50) throw new Error('transcript too short to analyze (<50 words)');
  return { text: raw, wordCount };
}
