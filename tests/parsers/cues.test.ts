/**
 * Day 8 Task 1: cue list to speaker-labelled prose.
 *
 * The rolling-caption cases are the ones that matter. Auto-generated captions
 * from YouTube, Zoom and Teams repeat the tail of each cue so the text scrolls
 * on screen. Concatenating those naively roughly triples the transcript, which
 * corrupts the word count, the token spend, and every character offset the
 * evidence spine depends on.
 */

import { describe, it, expect } from 'vitest';
import { cuesToProse } from '@/lib/parsers/cues';

describe('cuesToProse — merging', () => {
  it('merges consecutive cues from the same speaker into one paragraph', () => {
    const prose = cuesToProse([
      { speaker: 'Participant', text: 'I opened it on my phone' },
      { speaker: 'Participant', text: 'and it asked me for a workspace' },
    ]);

    expect(prose).toBe('Participant: I opened it on my phone and it asked me for a workspace');
  });

  it('starts a new block when the speaker changes', () => {
    const prose = cuesToProse([
      { speaker: 'Interviewer', text: 'Walk me through it' },
      { speaker: 'Participant', text: 'Sure' },
    ]);

    expect(prose).toBe('Interviewer: Walk me through it\n\nParticipant: Sure');
  });

  it('treats a cue with no speaker as a continuation of the current speaker', () => {
    // VTT commonly tags only the first cue of a turn with <v Speaker>.
    const prose = cuesToProse([
      { speaker: 'Participant', text: 'I opened it' },
      { speaker: null, text: 'and gave up' },
    ]);

    expect(prose).toBe('Participant: I opened it and gave up');
  });

  it('produces unlabelled paragraphs when nothing has a speaker', () => {
    const prose = cuesToProse([
      { speaker: null, text: 'the flow was confusing' },
      { speaker: null, text: 'so I left' },
    ]);

    expect(prose).toBe('the flow was confusing so I left');
  });

  it('returns a single block for a single cue', () => {
    expect(cuesToProse([{ speaker: 'P', text: 'just this' }])).toBe('P: just this');
  });
});

describe('cuesToProse — rolling captions', () => {
  it('trims the repeated tail of a rolling caption', () => {
    const prose = cuesToProse([
      { speaker: null, text: 'the onboarding' },
      { speaker: null, text: 'the onboarding flow lost' },
      { speaker: null, text: 'flow lost me at the second' },
    ]);

    expect(prose).toBe('the onboarding flow lost me at the second');
  });

  it('handles a long rolling sequence without compounding', () => {
    const prose = cuesToProse([
      { speaker: null, text: 'I signed up' },
      { speaker: null, text: 'I signed up on my phone' },
      { speaker: null, text: 'on my phone which was fine' },
      { speaker: null, text: 'which was fine and then I gave up' },
    ]);

    expect(prose).toBe('I signed up on my phone which was fine and then I gave up');
  });

  it('drops a cue entirely when it repeats text already accumulated', () => {
    const prose = cuesToProse([
      { speaker: null, text: 'the second screen' },
      { speaker: null, text: 'the second screen' },
    ]);

    expect(prose).toBe('the second screen');
  });

  it('ignores capitalisation when matching an overlap', () => {
    const prose = cuesToProse([
      { speaker: null, text: 'lost me at' },
      { speaker: null, text: 'Lost me at the second screen' },
    ]);

    expect(prose).toBe('lost me at the second screen');
  });

  it('does not trim on a one-word coincidence', () => {
    // "flow" ending one cue and starting the next is ordinary speech, not a
    // rolling repeat. Leaving a duplicated word is the safe failure; deleting
    // real speech is not.
    const prose = cuesToProse([
      { speaker: null, text: 'we talked about the flow' },
      { speaker: null, text: 'flow charts are different' },
    ]);

    expect(prose).toBe('we talked about the flow flow charts are different');
  });

  it('does not trim across a speaker change', () => {
    // The same words from two speakers is a real exchange, not a repeat.
    const prose = cuesToProse([
      { speaker: 'Interviewer', text: 'you gave up on it' },
      { speaker: 'Participant', text: 'you gave up on it, yes exactly' },
    ]);

    expect(prose).toBe(
      'Interviewer: you gave up on it\n\nParticipant: you gave up on it, yes exactly',
    );
  });
});

describe('cuesToProse — degenerate input', () => {
  it('returns an empty string for no cues', () => {
    expect(cuesToProse([])).toBe('');
  });

  it('skips cues whose text is empty or whitespace', () => {
    const prose = cuesToProse([
      { speaker: 'P', text: 'first' },
      { speaker: 'P', text: '   ' },
      { speaker: 'P', text: 'second' },
    ]);

    expect(prose).toBe('P: first second');
  });

  it('collapses internal whitespace and newlines inside a cue', () => {
    const prose = cuesToProse([{ speaker: null, text: 'wrapped\nacross   two lines' }]);

    expect(prose).toBe('wrapped across two lines');
  });

  it('does not emit a block for a speaker whose every cue was empty', () => {
    const prose = cuesToProse([
      { speaker: 'A', text: 'real text' },
      { speaker: 'B', text: '  ' },
      { speaker: 'C', text: 'more text' },
    ]);

    expect(prose).toBe('A: real text\n\nC: more text');
  });

  it('trims a speaker name with surrounding whitespace', () => {
    expect(cuesToProse([{ speaker: '  Participant  ', text: 'hi there' }])).toBe(
      'Participant: hi there',
    );
  });
});
