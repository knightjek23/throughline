/**
 * Day 8 Task 3: SubRip input.
 *
 * SRT has no speaker field, so attribution comes from the "NAME:" convention.
 * That convention collides with ordinary speech, so the lift is deliberately
 * conservative and the tests pin down where it stops.
 */

import { describe, it, expect } from 'vitest';
import { parseSrtCues, parseSrt } from '@/lib/parsers/srt';

describe('parseSrtCues — structure', () => {
  it('reads two subtitles', () => {
    const cues = parseSrtCues(
      '1\n00:00:01,000 --> 00:00:04,000\nI opened it\n\n2\n00:00:04,000 --> 00:00:07,000\nand gave up',
    );

    expect(cues).toEqual([
      { speaker: null, text: 'I opened it' },
      { speaker: null, text: 'and gave up' },
    ]);
  });

  it('accepts comma-decimal and dot-decimal timecodes', () => {
    const cues = parseSrtCues(
      '1\n00:00:01,000 --> 00:00:04,000\nfirst\n\n2\n00:00:04.000 --> 00:00:07.000\nsecond',
    );

    expect(cues.map((c) => c.text)).toEqual(['first', 'second']);
  });

  it('joins a multi-line payload', () => {
    const cues = parseSrtCues('1\n00:00:01,000 --> 00:00:04,000\nI opened it\nand gave up');

    expect(cues).toEqual([{ speaker: null, text: 'I opened it and gave up' }]);
  });

  it('tolerates CRLF, a BOM and a missing sequence number', () => {
    const cues = parseSrtCues('﻿00:00:01,000 --> 00:00:04,000\r\nI opened it');

    expect(cues).toEqual([{ speaker: null, text: 'I opened it' }]);
  });

  it('tolerates a trailing blank block', () => {
    const cues = parseSrtCues('1\n00:00:01,000 --> 00:00:04,000\nI opened it\n\n\n');

    expect(cues).toHaveLength(1);
  });
});

describe('parseSrtCues — markup', () => {
  it('strips position overrides', () => {
    const cues = parseSrtCues('1\n00:00:01,000 --> 00:00:04,000\n{\\an8}I opened it');

    expect(cues).toEqual([{ speaker: null, text: 'I opened it' }]);
  });

  it('strips italic, bold and font tags but keeps their text', () => {
    const cues = parseSrtCues(
      '1\n00:00:01,000 --> 00:00:04,000\nI <i>really</i> <b>did</b> <font color="#ffffff">give up</font>',
    );

    expect(cues).toEqual([{ speaker: null, text: 'I really did give up' }]);
  });

  it('strips a leading dialogue dash', () => {
    const cues = parseSrtCues('1\n00:00:01,000 --> 00:00:04,000\n- I opened it');

    expect(cues).toEqual([{ speaker: null, text: 'I opened it' }]);
  });

  it('decodes XML entities', () => {
    const cues = parseSrtCues(
      '1\n00:00:01,000 --> 00:00:04,000\nsetup &amp; onboarding &#39;broke&#39;',
    );

    expect(cues[0].text).toBe("setup & onboarding 'broke'");
  });
});

describe('parseSrtCues — speaker lifting', () => {
  it('lifts a capitalised NAME: prefix', () => {
    const cues = parseSrtCues('1\n00:00:01,000 --> 00:00:04,000\nParticipant: I opened it');

    expect(cues).toEqual([{ speaker: 'Participant', text: 'I opened it' }]);
  });

  it('lifts an all-caps NAME: prefix', () => {
    const cues = parseSrtCues('1\n00:00:01,000 --> 00:00:04,000\nINTERVIEWER: Walk me through it');

    expect(cues).toEqual([{ speaker: 'INTERVIEWER', text: 'Walk me through it' }]);
  });

  it('lifts a two-word name', () => {
    const cues = parseSrtCues('1\n00:00:01,000 --> 00:00:04,000\nPriya Patel: I opened it');

    expect(cues).toEqual([{ speaker: 'Priya Patel', text: 'I opened it' }]);
  });

  it('lifts a name after a dialogue dash', () => {
    const cues = parseSrtCues('1\n00:00:01,000 --> 00:00:04,000\n- Participant: I opened it');

    expect(cues).toEqual([{ speaker: 'Participant', text: 'I opened it' }]);
  });

  it('does not lift a lowercase prefix', () => {
    const cues = parseSrtCues('1\n00:00:01,000 --> 00:00:04,000\nso: here is the thing');

    expect(cues).toEqual([{ speaker: null, text: 'so: here is the thing' }]);
  });

  it('does not lift a long sentence that happens to contain a colon', () => {
    const cues = parseSrtCues(
      '1\n00:00:01,000 --> 00:00:04,000\nThe thing I kept coming back to was this: it never explained itself',
    );

    expect(cues[0].speaker).toBeNull();
  });

  it('does not lift a timestamp-looking prefix', () => {
    const cues = parseSrtCues('1\n00:00:01,000 --> 00:00:04,000\n12: that was the number');

    expect(cues[0].speaker).toBeNull();
  });
});

describe('parseSrtCues — rejection', () => {
  it('throws when there are no subtitles', () => {
    expect(() => parseSrtCues('not a subtitle file at all')).toThrow(/caption/i);
  });

  it('throws on an empty file', () => {
    expect(() => parseSrtCues('')).toThrow();
  });
});

describe('parseSrt — end to end', () => {
  it('produces speaker-labelled prose and applies the shared guards', () => {
    const blocks: string[] = [];
    blocks.push('1\n00:00:01,000 --> 00:00:04,000\nInterviewer: Walk me through the first time');
    for (let i = 0; i < 10; i++) {
      blocks.push(
        `${i + 2}\n00:00:0${i},000 --> 00:00:0${i + 1},000\nParticipant: chunk ${i} of the answer here`,
      );
    }

    const result = parseSrt(Buffer.from(blocks.join('\n\n'), 'utf8'));

    expect(result.text.startsWith('Interviewer: Walk me through the first time\n\nParticipant: chunk 0')).toBe(true);
    expect(result.wordCount).toBeGreaterThanOrEqual(50);
  });
});
