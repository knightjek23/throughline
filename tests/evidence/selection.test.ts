/**
 * Day 7: matching a selected span against the model's quotes.
 *
 * These are the environment-free half of `lib/evidence/selection`. The DOM half,
 * `resolveSelectionSpan`, is deliberately NOT tested here.
 *
 * It was, briefly, under jsdom. That test could not start: `require('jsdom')`
 * against this repo does not complete inside vitest's worker-ready window, so
 * the forked worker timed out and the file silently contributed zero tests while
 * the suite still reported green. happy-dom is not the fix either, at 3,120
 * files against jsdom's 657 it is likely worse on a filesystem that charges per
 * file.
 *
 * Testing DOM range arithmetic against a simulated DOM was the weaker option
 * regardless. `resolveSelectionSpan` is exercised in real Chromium instead, in
 * `docs/superpowers/proof/shoot.mjs`, against the compiled real source: within a
 * segment, across three segments, inside a mark, at an element-level boundary,
 * collapsed, outside the pane, and with no selection at all. Real Range and
 * Selection, not an approximation of them.
 */

import { describe, it, expect } from 'vitest';
import { quotesOverlapping, themesFor } from '@/lib/evidence/selection';
import type { Quote } from '@/lib/evidence/types';

function q(text: string, char_start: number, char_end: number, theme = 'Theme A'): Quote {
  return { text, theme, char_start, char_end };
}

const quotes = [
  q('one', 0, 3, 'Theme A'),
  q('two', 10, 13, 'Theme B'),
  q('three', 12, 17, 'Theme A'),
];

describe('quotesOverlapping', () => {
  it('returns quotes that intersect the span', () => {
    expect(quotesOverlapping({ start: 11, end: 13 }, quotes)).toEqual([1, 2]);
  });

  it('returns an empty list when nothing intersects', () => {
    expect(quotesOverlapping({ start: 4, end: 9 }, quotes)).toEqual([]);
  });

  it('treats a shared boundary as no overlap', () => {
    // The span ends exactly where quote 0 starts. Touching is not overlapping,
    // otherwise selecting the word after a quote claims that quote.
    expect(quotesOverlapping({ start: 3, end: 6 }, quotes)).toEqual([]);
  });

  it('matches a span fully inside a quote', () => {
    expect(quotesOverlapping({ start: 1, end: 2 }, quotes)).toEqual([0]);
  });

  it('matches a span that fully contains a quote', () => {
    expect(quotesOverlapping({ start: 0, end: 20 }, quotes)).toEqual([0, 1, 2]);
  });

  it('returns indices ascending regardless of quote order on the page', () => {
    expect(quotesOverlapping({ start: 0, end: 20 }, quotes)).toEqual([0, 1, 2]);
  });

  it('handles an empty quote list', () => {
    expect(quotesOverlapping({ start: 0, end: 20 }, [])).toEqual([]);
  });
});

describe('themesFor', () => {
  it('deduplicates theme names in first-seen order', () => {
    expect(themesFor([0, 1, 2], quotes)).toEqual(['Theme A', 'Theme B']);
  });

  it('ignores indices with no matching quote', () => {
    expect(themesFor([0, 99], quotes)).toEqual(['Theme A']);
  });

  it('returns an empty list for no indices', () => {
    expect(themesFor([], quotes)).toEqual([]);
  });

  it('collapses repeats of the same index', () => {
    expect(themesFor([1, 1, 1], quotes)).toEqual(['Theme B']);
  });
});
