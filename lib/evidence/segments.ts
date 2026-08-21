/**
 * The evidence spine's pure core.
 *
 * Turns a transcript plus the model's quotes into paragraph blocks of
 * character-addressed segments, where each segment knows which quotes cover it.
 * The interview detail page renders the result; nothing here touches React,
 * Supabase or the DOM, so the whole thing is unit-testable.
 *
 * Two rules drive the design.
 *
 * 1. Overlapping quotes flatten rather than nest. A boundary sweep produces a
 *    segment for every distinct span, and a span covered by two quotes carries
 *    both indices. Nested highlights are unreadable and lose one of the quotes.
 *
 * 2. Offsets are re-verified before use. `validateAndPrune` already guarantees
 *    `transcript.slice(char_start, char_end) === text` at write time, so a
 *    mismatch here means the stored data drifted. A drifted quote is reported
 *    as unlocatable and excluded, because a highlight at guessed coordinates
 *    points the researcher at the wrong sentence, which is worse than no
 *    highlight at all.
 */

import type { Quote } from './types';

// Re-exported so components and tests import the quote shape from one place.
export type { Quote };

export interface Segment {
  /** Stable ordinal across every block, used for DOM ids and scroll targets. */
  key: number;
  /** Absolute character offsets into the transcript. */
  start: number;
  end: number;
  text: string;
  /** Indices into the quotes array, ascending. Empty means unquoted. */
  quotes: number[];
}

export interface SegmentedTranscript {
  /** Paragraph blocks, split on blank lines. Separators are dropped. */
  blocks: Segment[][];
  /** Quote index to the key of the first segment covering it, or -1. */
  anchorFor: number[];
  /** Quote indices whose stored offsets could not be verified. */
  unlocatable: number[];
  /** Blocks holding at least one quoted segment. */
  quotedBlockCount: number;
}

interface LocatedQuote {
  index: number;
  start: number;
  end: number;
}

function isLocatable(transcript: string, quote: Quote): boolean {
  const { char_start: start, char_end: end } = quote;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  if (start < 0 || end <= start || end > transcript.length) return false;
  return transcript.slice(start, end) === quote.text;
}

/** Character ranges of each paragraph block, separators excluded. */
function blockRanges(transcript: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const separator = /\n{2,}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = separator.exec(transcript)) !== null) {
    if (match.index > cursor) ranges.push([cursor, match.index]);
    cursor = match.index + match[0].length;
  }
  if (cursor < transcript.length) ranges.push([cursor, transcript.length]);

  return ranges;
}

export function segmentTranscript(transcript: string, quotes: Quote[]): SegmentedTranscript {
  const located: LocatedQuote[] = [];
  const unlocatable: number[] = [];

  quotes.forEach((quote, index) => {
    if (isLocatable(transcript, quote)) {
      located.push({ index, start: quote.char_start, end: quote.char_end });
    } else {
      unlocatable.push(index);
    }
  });

  const anchorFor: number[] = quotes.map(() => -1);
  const blocks: Segment[][] = [];
  let key = 0;
  let quotedBlockCount = 0;

  for (const [blockStart, blockEnd] of blockRanges(transcript)) {
    // Boundaries inside this block: its own edges, plus any quote edge that
    // falls strictly within it. A quote spanning the block break contributes
    // one edge here and the other to a later block, which is what clips it.
    const boundaries = new Set<number>([blockStart, blockEnd]);
    for (const { start, end } of located) {
      if (start > blockStart && start < blockEnd) boundaries.add(start);
      if (end > blockStart && end < blockEnd) boundaries.add(end);
    }

    const ordered = Array.from(boundaries).sort((a, b) => a - b);
    const segments: Segment[] = [];

    for (let i = 0; i < ordered.length - 1; i++) {
      const start = ordered[i];
      const end = ordered[i + 1];
      const covering = located
        .filter((quote) => quote.start <= start && quote.end >= end)
        .map((quote) => quote.index);

      const segment: Segment = {
        key: key++,
        start,
        end,
        text: transcript.slice(start, end),
        quotes: covering,
      };
      segments.push(segment);

      for (const quoteIndex of covering) {
        if (anchorFor[quoteIndex] === -1) anchorFor[quoteIndex] = segment.key;
      }
    }

    blocks.push(segments);
    if (segments.some((segment) => segment.quotes.length > 0)) quotedBlockCount++;
  }

  return { blocks, anchorFor, unlocatable, quotedBlockCount };
}
