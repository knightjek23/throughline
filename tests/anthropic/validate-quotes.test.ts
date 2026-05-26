/**
 * Day 3 Task 5 tests: validateAndPrune() — quote substring validation +
 * orphan theme pruning.
 *
 * Pure function. Takes the model's raw analysis and the original transcript.
 * Returns { cleaned, droppedQuotes, droppedThemes } where the counts are
 * surfaced for telemetry (the caller emits the PostHog event with userId).
 *
 * Throws NoGroundedThemesError when zero themes survive pruning.
 */

import { describe, it, expect } from 'vitest';
import { validateAndPrune } from '@/lib/anthropic/validate-quotes';
import { NoGroundedThemesError } from '@/lib/anthropic/errors';
import type { InterviewAnalysis } from '@/lib/anthropic/schemas';

function makeAnalysis(overrides: Partial<InterviewAnalysis> = {}): InterviewAnalysis {
  return {
    summary: 'Default summary that is long enough to satisfy the schema minimum length.',
    sentiment: 'mixed',
    themes: [{ name: 'Theme A', description: 'Description for theme A that meets length.' }],
    quotes: [{ text: 'foo bar baz', theme: 'Theme A', char_start: 0, char_end: 11 }],
    ...overrides,
  };
}

describe('validateAndPrune — happy path', () => {
  it('passes through when all quotes match at given positions', () => {
    const transcript = 'foo bar baz qux';
    const { cleaned, droppedQuotes, droppedThemes } = validateAndPrune(makeAnalysis(), transcript);
    expect(droppedQuotes).toBe(0);
    expect(droppedThemes).toBe(0);
    expect(cleaned.quotes).toHaveLength(1);
    expect(cleaned.themes).toHaveLength(1);
  });

  it('preserves summary and sentiment unchanged', () => {
    const transcript = 'foo bar baz qux';
    const input = makeAnalysis({ summary: 'My specific summary that is long enough to count.', sentiment: 'positive' });
    const { cleaned } = validateAndPrune(input, transcript);
    expect(cleaned.summary).toBe('My specific summary that is long enough to count.');
    expect(cleaned.sentiment).toBe('positive');
  });
});

describe('validateAndPrune — char position correction', () => {
  it('fixes off-by-N positions when the quote text exists at a different offset', () => {
    const transcript = 'preamble preamble foo bar baz qux';
    const analysis = makeAnalysis({
      quotes: [{ text: 'foo bar baz', theme: 'Theme A', char_start: 0, char_end: 11 }],
    });
    const { cleaned, droppedQuotes } = validateAndPrune(analysis, transcript);
    expect(droppedQuotes).toBe(0);
    expect(cleaned.quotes).toHaveLength(1);
    expect(cleaned.quotes[0].char_start).toBe(18);
    expect(cleaned.quotes[0].char_end).toBe(29);
    expect(transcript.slice(cleaned.quotes[0].char_start, cleaned.quotes[0].char_end)).toBe(
      'foo bar baz',
    );
  });
});

describe('validateAndPrune — quote drops', () => {
  it('drops quotes whose text is not anywhere in the transcript', () => {
    const transcript = 'this is the actual transcript content here';
    const analysis = makeAnalysis({
      themes: [
        { name: 'Theme A', description: 'Description for theme A that meets length.' },
        { name: 'Theme B', description: 'Description for theme B that meets length.' },
      ],
      quotes: [
        { text: 'this is the', theme: 'Theme A', char_start: 0, char_end: 11 },
        { text: 'totally hallucinated phrase', theme: 'Theme B', char_start: 0, char_end: 27 },
      ],
    });
    const { cleaned, droppedQuotes } = validateAndPrune(analysis, transcript);
    expect(droppedQuotes).toBe(1);
    expect(cleaned.quotes).toHaveLength(1);
    expect(cleaned.quotes[0].theme).toBe('Theme A');
  });

  it('drops quotes whose theme field does not match any theme.name', () => {
    const transcript = 'this is the real content here';
    const analysis = makeAnalysis({
      themes: [{ name: 'Theme A', description: 'Description for theme A that meets length.' }],
      quotes: [
        { text: 'this is the real', theme: 'Theme A', char_start: 0, char_end: 16 },
        { text: 'content here', theme: 'Phantom Theme', char_start: 17, char_end: 29 },
      ],
    });
    const { cleaned, droppedQuotes } = validateAndPrune(analysis, transcript);
    expect(droppedQuotes).toBe(1);
    expect(cleaned.quotes).toHaveLength(1);
    expect(cleaned.quotes[0].theme).toBe('Theme A');
  });
});

describe('validateAndPrune — theme pruning', () => {
  it('prunes a theme when its last quote drops', () => {
    const transcript = 'transcript with only one valid quote here';
    const analysis = makeAnalysis({
      themes: [
        { name: 'Theme A', description: 'Description that meets length minimum.' },
        { name: 'Theme B', description: 'Description that meets length minimum too.' },
      ],
      quotes: [
        { text: 'only one valid quote', theme: 'Theme A', char_start: 16, char_end: 36 },
        { text: 'fabricated phrase', theme: 'Theme B', char_start: 0, char_end: 17 },
      ],
    });
    const { cleaned, droppedThemes } = validateAndPrune(analysis, transcript);
    expect(droppedThemes).toBe(1);
    expect(cleaned.themes.map((t) => t.name)).toEqual(['Theme A']);
  });

  it('prunes themes that had zero quotes from the model in the first place', () => {
    const transcript = 'foo bar baz content here';
    const analysis = makeAnalysis({
      themes: [
        { name: 'Theme A', description: 'Description that meets length minimum.' },
        { name: 'Theme B', description: 'Description that meets length minimum too.' },
      ],
      quotes: [{ text: 'foo bar', theme: 'Theme A', char_start: 0, char_end: 7 }],
    });
    const { cleaned, droppedThemes } = validateAndPrune(analysis, transcript);
    expect(droppedThemes).toBe(1);
    expect(cleaned.themes.map((t) => t.name)).toEqual(['Theme A']);
  });
});

describe('validateAndPrune — em/en dash stripping', () => {
  it('strips em dashes from the summary', () => {
    const transcript = 'real content here that exists in transcript';
    const analysis = makeAnalysis({
      summary:
        'Participant talked about their job — it was very fragmented and exhausting at times.',
      themes: [{ name: 'Theme A', description: 'Description for theme A that meets length.' }],
      quotes: [{ text: 'real content', theme: 'Theme A', char_start: 0, char_end: 12 }],
    });
    const { cleaned } = validateAndPrune(analysis, transcript);
    expect(cleaned.summary).not.toMatch(/[—–]/);
  });

  it('strips em dashes from theme name and description', () => {
    const transcript = 'real content here that exists in transcript';
    const analysis = makeAnalysis({
      themes: [
        {
          name: 'Tool fatigue — burnout',
          description: 'They are tired — really tired — of new tools every quarter.',
        },
      ],
      quotes: [
        { text: 'real content', theme: 'Tool fatigue — burnout', char_start: 0, char_end: 12 },
      ],
    });
    const { cleaned } = validateAndPrune(analysis, transcript);
    expect(cleaned.themes[0].name).not.toMatch(/[—–]/);
    expect(cleaned.themes[0].description).not.toMatch(/[—–]/);
  });

  it('keeps quote.theme matching theme.name after stripping both', () => {
    // quote.theme is stripped symmetrically so the membership check still
    // succeeds; otherwise quotes would orphan after normalization.
    const transcript = 'real content here that exists in transcript';
    const analysis = makeAnalysis({
      themes: [
        {
          name: 'Pricing — barriers',
          description: 'Cost shows up unprompted as a blocker on tool adoption.',
        },
      ],
      quotes: [
        {
          text: 'real content',
          theme: 'Pricing — barriers',
          char_start: 0,
          char_end: 12,
        },
      ],
    });
    const { cleaned, droppedQuotes, droppedThemes } = validateAndPrune(analysis, transcript);
    expect(droppedQuotes).toBe(0);
    expect(droppedThemes).toBe(0);
    expect(cleaned.themes[0].name).toBe(cleaned.quotes[0].theme);
  });

  it('preserves em dashes in quote.text (must stay verbatim from transcript)', () => {
    const transcript = 'I said something — and then they laughed loudly at it.';
    const analysis = makeAnalysis({
      themes: [
        { name: 'Theme A', description: 'Description for theme A that meets length.' },
      ],
      quotes: [
        {
          text: 'I said something — and then they laughed',
          theme: 'Theme A',
          char_start: 0,
          char_end: 40,
        },
      ],
    });
    const { cleaned } = validateAndPrune(analysis, transcript);
    expect(cleaned.quotes[0].text).toContain('—');
  });
});

describe('validateAndPrune — total failure', () => {
  it('throws NoGroundedThemesError when all themes orphan', () => {
    const transcript = 'real transcript content here only';
    const analysis = makeAnalysis({
      themes: [
        { name: 'Theme A', description: 'Description that meets length minimum.' },
        { name: 'Theme B', description: 'Description that meets length minimum too.' },
      ],
      quotes: [
        { text: 'first hallucinated', theme: 'Theme A', char_start: 0, char_end: 18 },
        { text: 'second hallucinated', theme: 'Theme B', char_start: 0, char_end: 19 },
      ],
    });
    expect(() => validateAndPrune(analysis, transcript)).toThrow(NoGroundedThemesError);
  });

  it('uses the spec failure_reason as the error message', () => {
    const transcript = 'real content';
    const analysis = makeAnalysis({
      quotes: [{ text: 'totally fake quote', theme: 'Theme A', char_start: 0, char_end: 18 }],
    });
    try {
      validateAndPrune(analysis, transcript);
      expect.fail('expected NoGroundedThemesError');
    } catch (err) {
      expect(err).toBeInstanceOf(NoGroundedThemesError);
      expect((err as Error).message).toBe('Analysis returned no grounded themes.');
    }
  });
});
