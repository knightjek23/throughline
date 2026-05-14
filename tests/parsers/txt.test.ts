/**
 * Unit tests for the .txt transcript parser.
 *
 * Covers the contract: happy path returns text + word count, empty/short/
 * oversized inputs throw with clear messages, line endings normalize to LF,
 * and BOM is stripped.
 */

import { describe, it, expect } from 'vitest';
import { parseTxt } from '@/lib/parsers/txt';

/** Builds a synthetic transcript of `n` space-separated words. */
function words(n: number, prefix = 'word'): string {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
}

describe('parseTxt', () => {
  it('returns text and word count for a valid transcript', () => {
    const input = words(100);
    const result = parseTxt(Buffer.from(input, 'utf8'));
    expect(result.wordCount).toBe(100);
    expect(result.text).toBe(input);
  });

  it('throws on an empty buffer', () => {
    expect(() => parseTxt(Buffer.from('', 'utf8'))).toThrow(/empty/i);
  });

  it('throws on whitespace-only content', () => {
    expect(() => parseTxt(Buffer.from('   \n  \t  ', 'utf8'))).toThrow(/empty/i);
  });

  it('throws when the transcript has fewer than 50 words', () => {
    expect(() => parseTxt(Buffer.from(words(20), 'utf8'))).toThrow(/too short/i);
  });

  it('strips a leading UTF-8 BOM', () => {
    const bom = '﻿';
    const input = bom + words(100);
    const result = parseTxt(Buffer.from(input, 'utf8'));
    expect(result.text.startsWith(bom)).toBe(false);
    expect(result.text.startsWith('word0')).toBe(true);
    expect(result.wordCount).toBe(100);
  });

  it('normalizes CRLF line endings to LF', () => {
    const input = words(60).split(' ').join('\r\n');
    const result = parseTxt(Buffer.from(input, 'utf8'));
    expect(result.text).not.toContain('\r\n');
    expect(result.text).not.toContain('\r');
    expect(result.wordCount).toBe(60);
  });

  it('throws on transcripts exceeding the 500k char cap', () => {
    // ~1.2M chars so we comfortably blow past 500k.
    const huge = (words(100) + ' ').repeat(2000);
    expect(() => parseTxt(Buffer.from(huge, 'utf8'))).toThrow(/exceeds/i);
  });

  it('preserves internal whitespace and punctuation', () => {
    const input =
      'Q: How did you discover the product?\n\n' +
      'A: ' +
      words(60) +
      '. It was a really useful tool.';
    const result = parseTxt(Buffer.from(input, 'utf8'));
    expect(result.text).toContain('Q: How did you discover');
    expect(result.text).toContain('really useful tool');
  });
});
