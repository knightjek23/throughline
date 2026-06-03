/**
 * Day 4 Task 1 tests: stripEmDashes() shared helper.
 *
 * Lifted from validate-quotes.ts so the synthesize pipeline can reuse it.
 * Same semantics: number ranges become "X to Y", everything else collapses
 * to a comma, double-spaces and double-commas dedupe, leading/trailing
 * whitespace trims. Plain hyphens in compound words stay untouched.
 */

import { describe, it, expect } from 'vitest';
import { stripEmDashes } from '@/lib/anthropic/text-normalize';

describe('stripEmDashes', () => {
  it('returns empty string unchanged', () => {
    expect(stripEmDashes('')).toBe('');
  });

  it('returns text without dashes unchanged in content', () => {
    expect(stripEmDashes('A plain sentence with no dashes at all.')).toBe(
      'A plain sentence with no dashes at all.',
    );
  });

  it('replaces a spaced em dash with comma + space', () => {
    expect(stripEmDashes('First clause — second clause.')).toBe('First clause, second clause.');
  });

  it('replaces a spaced en dash with comma + space', () => {
    expect(stripEmDashes('First clause – second clause.')).toBe('First clause, second clause.');
  });

  it('replaces an em dash flanking digits with " to "', () => {
    expect(stripEmDashes('Day 4—5')).toBe('Day 4 to 5');
  });

  it('replaces an en dash flanking digits with " to "', () => {
    expect(stripEmDashes('Pages 12–15')).toBe('Pages 12 to 15');
  });

  it('replaces a spaced double hyphen with comma + space', () => {
    expect(stripEmDashes('Some text -- with double hyphen.')).toBe(
      'Some text, with double hyphen.',
    );
  });

  it('handles multiple em dashes in one string', () => {
    expect(stripEmDashes('A — B — C')).toBe('A, B, C');
  });

  it('does not touch a regular hyphen in compound words', () => {
    expect(stripEmDashes('A real-time, end-to-end test case.')).toBe(
      'A real-time, end-to-end test case.',
    );
  });

  it('collapses repeated commas that result from adjacent strips', () => {
    expect(stripEmDashes('A — — B')).toBe('A, B');
  });

  it('trims leading and trailing whitespace from the final output', () => {
    expect(stripEmDashes('  hello world  ')).toBe('hello world');
  });

  it('collapses internal double-spaces produced by stripping', () => {
    expect(stripEmDashes('hello    world')).toBe('hello world');
  });
});
