/**
 * Day 8 Task 2: WEBVTT input.
 *
 * `parseVttCues` is the format reader and is tested directly. `parseVtt` is the
 * thin wrapper that hands off to cuesToProse and the shared size guards.
 */

import { describe, it, expect } from 'vitest';
import { parseVttCues, parseVtt } from '@/lib/parsers/vtt';

function vtt(body: string): string {
  return `WEBVTT\n\n${body}`;
}

describe('parseVttCues — structure', () => {
  it('reads two cues', () => {
    const cues = parseVttCues(
      vtt('00:00:01.000 --> 00:00:04.000\nI opened it\n\n00:00:04.000 --> 00:00:07.000\nand gave up'),
    );

    expect(cues).toEqual([
      { speaker: null, text: 'I opened it' },
      { speaker: null, text: 'and gave up' },
    ]);
  });

  it('drops a cue identifier line before the timestamp', () => {
    const cues = parseVttCues(vtt('cue-1\n00:00:01.000 --> 00:00:04.000\nI opened it'));

    expect(cues).toEqual([{ speaker: null, text: 'I opened it' }]);
  });

  it('accepts positioning settings on the timestamp line', () => {
    const cues = parseVttCues(
      vtt('00:00:01.000 --> 00:00:04.000 align:start line:0% position:50%\nI opened it'),
    );

    expect(cues).toEqual([{ speaker: null, text: 'I opened it' }]);
  });

  it('accepts short mm:ss.mmm timestamps', () => {
    const cues = parseVttCues(vtt('01.000 --> 04.000\nI opened it\n\n00:05.000 --> 00:09.000\nagain'));

    expect(cues.map((c) => c.text)).toEqual(['I opened it', 'again']);
  });

  it('joins a multi-line cue payload', () => {
    const cues = parseVttCues(vtt('00:00:01.000 --> 00:00:04.000\nI opened it\nand gave up'));

    expect(cues).toEqual([{ speaker: null, text: 'I opened it and gave up' }]);
  });

  it('drops NOTE, STYLE and REGION blocks', () => {
    const cues = parseVttCues(
      vtt(
        'NOTE this is a comment\nspanning two lines\n\n' +
          'STYLE\n::cue { color: peachpuff; }\n\n' +
          'REGION\nid:fred width:40%\n\n' +
          '00:00:01.000 --> 00:00:04.000\nI opened it',
      ),
    );

    expect(cues).toEqual([{ speaker: null, text: 'I opened it' }]);
  });

  it('tolerates a BOM and CRLF line endings', () => {
    const cues = parseVttCues('﻿WEBVTT\r\n\r\n00:00:01.000 --> 00:00:04.000\r\nI opened it');

    expect(cues).toEqual([{ speaker: null, text: 'I opened it' }]);
  });
});

describe('parseVttCues — speakers and markup', () => {
  it('reads a <v Speaker> voice tag', () => {
    const cues = parseVttCues(vtt('00:00:01.000 --> 00:00:04.000\n<v Participant>I opened it'));

    expect(cues).toEqual([{ speaker: 'Participant', text: 'I opened it' }]);
  });

  it('reads a voice tag carrying classes', () => {
    const cues = parseVttCues(
      vtt('00:00:01.000 --> 00:00:04.000\n<v.loud.first Interviewer>Walk me through it'),
    );

    expect(cues).toEqual([{ speaker: 'Interviewer', text: 'Walk me through it' }]);
  });

  it('closes a voice tag without leaking the closing tag into the text', () => {
    const cues = parseVttCues(
      vtt('00:00:01.000 --> 00:00:04.000\n<v Participant>I opened it</v>'),
    );

    expect(cues).toEqual([{ speaker: 'Participant', text: 'I opened it' }]);
  });

  it('strips other markup but keeps its text', () => {
    const cues = parseVttCues(
      vtt('00:00:01.000 --> 00:00:04.000\nI <i>really</i> <b>did</b> <c.yellow>give up</c>'),
    );

    expect(cues).toEqual([{ speaker: null, text: 'I really did give up' }]);
  });

  it('decodes XML entities', () => {
    const cues = parseVttCues(
      vtt('00:00:01.000 --> 00:00:04.000\nsetup &amp; onboarding &lt;that part&gt; &#39;broke&#39;'),
    );

    expect(cues[0].text).toBe("setup & onboarding <that part> 'broke'");
  });
});

describe('parseVttCues — rejection', () => {
  it('throws when the WEBVTT header is missing', () => {
    expect(() => parseVttCues('00:00:01.000 --> 00:00:04.000\nI opened it')).toThrow(/WEBVTT/i);
  });

  it('throws when there are no cues', () => {
    expect(() => parseVttCues(vtt('NOTE nothing but a comment'))).toThrow(/caption/i);
  });

  it('throws on an empty file', () => {
    expect(() => parseVttCues('')).toThrow();
  });
});

describe('parseVtt — end to end', () => {
  it('turns rolling captions into deduplicated prose with an honest word count', () => {
    const body = [
      '00:00:01.000 --> 00:00:03.000',
      '<v Participant>I signed up',
      '',
      '00:00:03.000 --> 00:00:05.000',
      '<v Participant>I signed up on my phone',
      '',
      '00:00:05.000 --> 00:00:07.000',
      '<v Participant>on my phone which was fine and then I gave up on the whole thing',
    ].join('\n');

    // Pad past the 50-word guard with a second speaker turn.
    const padding = [
      '',
      '',
      '00:00:07.000 --> 00:00:20.000',
      '<v Interviewer>' + Array.from({ length: 50 }, (_, i) => `word${i}`).join(' '),
    ].join('\n');

    const result = parseVtt(Buffer.from(vtt(body + padding), 'utf8'));

    expect(result.text).toContain(
      'Participant: I signed up on my phone which was fine and then I gave up on the whole thing',
    );
    // The participant turn is 18 words after dedup, not the 24 a naive
    // concatenation gives. Plus one word for each "Speaker:" label and the
    // 50-word padding turn.
    expect(result.wordCount).toBe(1 + 18 + 1 + 50);
  });

  it('applies the shared too-short guard', () => {
    expect(() => parseVtt(Buffer.from(vtt('00:00:01.000 --> 00:00:04.000\ntoo short'), 'utf8'))).toThrow(
      /too short/i,
    );
  });
});
