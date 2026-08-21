/**
 * Day 7 Task 1 tests: segmentTranscript() — boundary-sweep a transcript into
 * paragraph blocks of character-addressed segments.
 *
 * Pure function. Takes transcript_text plus quotes_json and returns blocks of
 * segments, each carrying the indices of the quotes covering it, plus an
 * anchor map and the list of quotes whose offsets could not be verified.
 */

import { describe, it, expect } from 'vitest';
import { segmentTranscript } from '@/lib/evidence/segments';
import type { Quote } from '@/lib/evidence/segments';

function q(text: string, char_start: number, char_end: number, theme = 'Theme A'): Quote {
  return { text, theme, char_start, char_end };
}

describe('segmentTranscript — single quote', () => {
  it('splits into before, quoted, after', () => {
    const transcript = 'aaa QUOTED bbb';
    const result = segmentTranscript(transcript, [q('QUOTED', 4, 10)]);

    expect(result.blocks).toHaveLength(1);
    const segments = result.blocks[0];
    expect(segments.map((s) => s.text)).toEqual(['aaa ', 'QUOTED', ' bbb']);
    expect(segments.map((s) => s.quotes)).toEqual([[], [0], []]);
  });

  it('carries the character offsets of each segment', () => {
    const transcript = 'aaa QUOTED bbb';
    const [segments] = segmentTranscript(transcript, [q('QUOTED', 4, 10)]).blocks;

    expect(segments.map((s) => [s.start, s.end])).toEqual([
      [0, 4],
      [4, 10],
      [10, 14],
    ]);
  });

  it('handles a quote at the very start and at the very end', () => {
    const transcript = 'HEAD middle TAIL';
    const result = segmentTranscript(transcript, [q('HEAD', 0, 4), q('TAIL', 12, 16)]);
    const [segments] = result.blocks;

    expect(segments.map((s) => s.text)).toEqual(['HEAD', ' middle ', 'TAIL']);
    expect(segments.map((s) => s.quotes)).toEqual([[0], [], [1]]);
  });
});

describe('segmentTranscript — overlapping quotes', () => {
  it('gives the overlap a segment carrying both indices in ascending order', () => {
    //              0123456789...
    const transcript = 'the quick brown fox jumps';
    // quote 0 covers "quick brown" (4..15), quote 1 covers "brown fox" (10..19)
    const result = segmentTranscript(transcript, [
      q('quick brown', 4, 15),
      q('brown fox', 10, 19),
    ]);
    const [segments] = result.blocks;

    expect(segments.map((s) => s.text)).toEqual(['the ', 'quick ', 'brown', ' fox', ' jumps']);
    expect(segments.map((s) => s.quotes)).toEqual([[], [0], [0, 1], [1], []]);
  });

  it('does not drop either quote from the anchor map', () => {
    const transcript = 'the quick brown fox jumps';
    const result = segmentTranscript(transcript, [
      q('quick brown', 4, 15),
      q('brown fox', 10, 19),
    ]);

    expect(result.anchorFor[0]).toBeGreaterThanOrEqual(0);
    expect(result.anchorFor[1]).toBeGreaterThanOrEqual(0);
    expect(result.unlocatable).toEqual([]);
  });

  it('collapses two quotes with identical spans into one segment', () => {
    const transcript = 'aaa SAME bbb';
    const result = segmentTranscript(transcript, [
      q('SAME', 4, 8, 'Theme A'),
      q('SAME', 4, 8, 'Theme B'),
    ]);
    const [segments] = result.blocks;

    expect(segments.map((s) => s.text)).toEqual(['aaa ', 'SAME', ' bbb']);
    expect(segments[1].quotes).toEqual([0, 1]);
  });

  it('does not emit a zero-length segment between adjacent quotes', () => {
    const transcript = 'ABCDEabcde';
    const result = segmentTranscript(transcript, [q('ABCDE', 0, 5), q('abcde', 5, 10)]);
    const [segments] = result.blocks;

    expect(segments.every((s) => s.end > s.start)).toBe(true);
    expect(segments.map((s) => s.text)).toEqual(['ABCDE', 'abcde']);
  });

  it('handles a quote fully contained inside another', () => {
    const transcript = 'xx OUTER INNER OUTER xx';
    const result = segmentTranscript(transcript, [
      q('OUTER INNER OUTER', 3, 20),
      q('INNER', 9, 14),
    ]);
    const [segments] = result.blocks;

    expect(segments.map((s) => s.quotes)).toEqual([[], [0], [0, 1], [0], []]);
  });
});

describe('segmentTranscript — unverifiable offsets', () => {
  it('marks a quote unlocatable when the slice does not match its text', () => {
    const transcript = 'aaa QUOTED bbb';
    const result = segmentTranscript(transcript, [q('SOMETHING ELSE', 4, 10)]);

    expect(result.unlocatable).toEqual([0]);
    expect(result.anchorFor[0]).toBe(-1);
    expect(result.blocks[0].every((s) => s.quotes.length === 0)).toBe(true);
  });

  it('marks a quote unlocatable when char_end runs past the transcript', () => {
    const transcript = 'short';
    const result = segmentTranscript(transcript, [q('short but longer', 0, 90)]);

    expect(result.unlocatable).toEqual([0]);
    expect(result.blocks[0].map((s) => s.text)).toEqual(['short']);
  });

  it('keeps segmenting the locatable quotes around an unlocatable one', () => {
    const transcript = 'aaa GOOD bbb';
    const result = segmentTranscript(transcript, [q('WRONG', 0, 3), q('GOOD', 4, 8)]);

    expect(result.unlocatable).toEqual([0]);
    expect(result.anchorFor[0]).toBe(-1);
    expect(result.anchorFor[1]).toBeGreaterThanOrEqual(0);
    const quoted = result.blocks[0].filter((s) => s.quotes.length > 0);
    expect(quoted).toHaveLength(1);
    expect(quoted[0].text).toBe('GOOD');
    expect(quoted[0].quotes).toEqual([1]);
  });

  it('treats a negative char_start as unlocatable rather than clamping it', () => {
    const transcript = 'aaa GOOD bbb';
    const result = segmentTranscript(transcript, [q('GOOD', -4, 8)]);

    expect(result.unlocatable).toEqual([0]);
  });
});

describe('segmentTranscript — paragraph blocks', () => {
  it('splits on a blank line and drops the separator', () => {
    const transcript = 'first para\n\nsecond para';
    const result = segmentTranscript(transcript, []);

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0].map((s) => s.text)).toEqual(['first para']);
    expect(result.blocks[1].map((s) => s.text)).toEqual(['second para']);
  });

  it('keeps a single newline inside one block', () => {
    const transcript = 'Interviewer: hello\nParticipant: hi';
    const result = segmentTranscript(transcript, []);

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0][0].text).toBe('Interviewer: hello\nParticipant: hi');
  });

  it('preserves absolute offsets in the second block', () => {
    const transcript = 'first para\n\nsecond para';
    const result = segmentTranscript(transcript, []);

    expect([result.blocks[1][0].start, result.blocks[1][0].end]).toEqual([12, 23]);
  });

  it('clips a quote that spans a block break into both blocks', () => {
    //                  0         1         2
    //                  0123456789012345678901
    const transcript = 'aaa bbb\n\nccc ddd';
    // "bbb\n\nccc" spans the break: 4..12
    const result = segmentTranscript(transcript, [q('bbb\n\nccc', 4, 12)]);

    const firstBlockQuoted = result.blocks[0].filter((s) => s.quotes.includes(0));
    const secondBlockQuoted = result.blocks[1].filter((s) => s.quotes.includes(0));

    expect(firstBlockQuoted.map((s) => s.text)).toEqual(['bbb']);
    expect(secondBlockQuoted.map((s) => s.text)).toEqual(['ccc']);
  });

  it('gives every segment across every block a unique key', () => {
    const transcript = 'aaa QUOTED bbb\n\nccc OTHER ddd';
    const result = segmentTranscript(transcript, [q('QUOTED', 4, 10), q('OTHER', 20, 25)]);

    const keys = result.blocks.flat().map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  it('collapses runs of more than two newlines into one break', () => {
    const transcript = 'one\n\n\n\ntwo';
    const result = segmentTranscript(transcript, []);

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks.flat().map((s) => s.text)).toEqual(['one', 'two']);
  });
});

describe('segmentTranscript — anchorFor', () => {
  it('points each quote at the first segment covering it', () => {
    const transcript = 'the quick brown fox jumps';
    const result = segmentTranscript(transcript, [
      q('quick brown', 4, 15),
      q('brown fox', 10, 19),
    ]);

    const byKey = new Map(result.blocks.flat().map((s) => [s.key, s]));
    expect(byKey.get(result.anchorFor[0])!.text).toBe('quick ');
    expect(byKey.get(result.anchorFor[1])!.text).toBe('brown');
  });

  it('anchors a block-spanning quote to its first block', () => {
    const transcript = 'aaa bbb\n\nccc ddd';
    const result = segmentTranscript(transcript, [q('bbb\n\nccc', 4, 12)]);

    const byKey = new Map(result.blocks.flat().map((s) => [s.key, s]));
    expect(byKey.get(result.anchorFor[0])!.text).toBe('bbb');
  });
});

describe('segmentTranscript — quotedBlockCount', () => {
  it('counts blocks containing at least one quoted segment', () => {
    const transcript = 'aaa QUOTED bbb\n\nnothing here\n\nccc OTHER ddd';
    const result = segmentTranscript(transcript, [q('QUOTED', 4, 10), q('OTHER', 34, 39)]);

    expect(result.blocks).toHaveLength(3);
    expect(result.quotedBlockCount).toBe(2);
  });

  it('counts a block once even when it holds several quotes', () => {
    const transcript = 'AAA middle BBB';
    const result = segmentTranscript(transcript, [q('AAA', 0, 3), q('BBB', 11, 14)]);

    expect(result.quotedBlockCount).toBe(1);
  });

  it('is zero when no quote is locatable', () => {
    const transcript = 'aaa bbb';
    const result = segmentTranscript(transcript, [q('nope', 0, 4)]);

    expect(result.quotedBlockCount).toBe(0);
  });
});

describe('segmentTranscript — degenerate input', () => {
  it('returns one segment per block when there are no quotes', () => {
    const transcript = 'one\n\ntwo';
    const result = segmentTranscript(transcript, []);

    expect(result.blocks.map((b) => b.length)).toEqual([1, 1]);
    expect(result.blocks.flat().every((s) => s.quotes.length === 0)).toBe(true);
    expect(result.anchorFor).toEqual([]);
  });

  it('returns no blocks for an empty transcript', () => {
    const result = segmentTranscript('', [q('anything', 0, 8)]);

    expect(result.blocks).toEqual([]);
    expect(result.unlocatable).toEqual([0]);
    expect(result.quotedBlockCount).toBe(0);
  });

  it('ignores leading and trailing blank lines rather than emitting empty blocks', () => {
    const result = segmentTranscript('\n\nbody\n\n', []);

    expect(result.blocks.map((b) => b.map((s) => s.text))).toEqual([['body']]);
  });

  it('treats a zero-length quote span as unlocatable', () => {
    const result = segmentTranscript('aaa bbb', [q('', 3, 3)]);

    expect(result.unlocatable).toEqual([0]);
  });
});

describe('segmentTranscript — scale', () => {
  it('segments a transcript at the 500,000 char parser cap within budget', () => {
    const paragraph = 'The onboarding flow lost me at the second screen and I gave up. '.repeat(4);
    const blockCount = Math.ceil(500_000 / paragraph.length);
    const transcript = Array.from({ length: blockCount }, () => paragraph).join('\n\n');

    // 20 quotes, the schema maximum, spread across the transcript.
    const quotes = Array.from({ length: 20 }, (_, i) => {
      const start = Math.floor((transcript.length / 20) * i) + 1;
      const from = transcript.indexOf('onboarding', start);
      return {
        text: transcript.slice(from, from + 10),
        theme: `Theme ${i}`,
        char_start: from,
        char_end: from + 10,
      };
    });

    const startedAt = performance.now();
    const result = segmentTranscript(transcript, quotes);
    const elapsed = performance.now() - startedAt;

    expect(result.unlocatable).toEqual([]);
    expect(result.blocks.length).toBe(blockCount);
    expect(result.quotedBlockCount).toBeGreaterThan(0);
    expect(result.quotedBlockCount).toBeLessThanOrEqual(20);
    expect(elapsed).toBeLessThan(500);
  });
});
