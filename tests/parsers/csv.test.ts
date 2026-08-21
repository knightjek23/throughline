/**
 * Day 8 Task 5: Dovetail CSV export reader.
 *
 * A CSV is not one transcript, so this returns many. The contract that matters
 * is that a single bad row can never discard the good ones: structural problems
 * throw, per-row problems are skipped and reported.
 */

import { describe, it, expect } from 'vitest';
import { parseDovetailCsv } from '@/lib/parsers/csv';

function csv(body: string): Buffer {
  return Buffer.from(body, 'utf8');
}

const LONG = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');

describe('parseDovetailCsv — structure', () => {
  it('reads one interview per row', () => {
    const result = parseDovetailCsv(csv(`Title,Content\nFirst,${LONG}\nSecond,${LONG}`));

    expect(result.interviews.map((i) => i.title)).toEqual(['First', 'Second']);
    expect(result.totalRows).toBe(2);
    expect(result.skipped).toEqual([]);
  });

  it('counts words per row', () => {
    const result = parseDovetailCsv(csv(`Title,Content\nFirst,${LONG}`));

    expect(result.interviews[0].wordCount).toBe(60);
  });

  it('matches headers case-insensitively and ignores their order', () => {
    const result = parseDovetailCsv(csv(`content,TITLE\n${LONG},First`));

    expect(result.interviews[0].title).toBe('First');
    expect(result.interviews[0].text).toBe(LONG);
  });

  it('ignores extra columns', () => {
    const result = parseDovetailCsv(
      csv(`Title,Tags,Content,Created\nFirst,alpha;beta,${LONG},2026-01-01`),
    );

    expect(result.interviews[0].text).toBe(LONG);
  });

  it('strips a BOM and handles CRLF', () => {
    const result = parseDovetailCsv(csv(`﻿Title,Content\r\nFirst,${LONG}\r\n`));

    expect(result.interviews).toHaveLength(1);
    expect(result.interviews[0].title).toBe('First');
  });

  it('ignores a trailing blank line', () => {
    const result = parseDovetailCsv(csv(`Title,Content\nFirst,${LONG}\n\n`));

    expect(result.totalRows).toBe(1);
  });
});

describe('parseDovetailCsv — RFC 4180 quoting', () => {
  it('reads a quoted field containing a comma', () => {
    const result = parseDovetailCsv(csv(`Title,Content\n"Smith, Priya",${LONG}`));

    expect(result.interviews[0].title).toBe('Smith, Priya');
  });

  it('reads a quoted field containing newlines', () => {
    const body = `Title,Content\nFirst,"line one\nline two\n\n${LONG}"`;
    const result = parseDovetailCsv(csv(body));

    expect(result.interviews).toHaveLength(1);
    expect(result.interviews[0].text).toContain('line one\nline two');
  });

  it('reads a doubled quote as an escaped quote', () => {
    const result = parseDovetailCsv(csv(`Title,Content\n"She said ""no""",${LONG}`));

    expect(result.interviews[0].title).toBe('She said "no"');
  });

  it('treats a quote in the middle of an unquoted field as literal', () => {
    const result = parseDovetailCsv(csv(`Title,Content\n5" screen,${LONG}`));

    expect(result.interviews[0].title).toBe('5" screen');
  });

  it('preserves a semicolon-separated multi-select as written', () => {
    const result = parseDovetailCsv(csv(`Title,Content,Tags\nFirst,${LONG},alpha;beta;gamma`));

    expect(result.interviews).toHaveLength(1);
  });
});

describe('parseDovetailCsv — structural rejection', () => {
  it('throws when Title is missing, naming the headers it found', () => {
    expect(() => parseDovetailCsv(csv(`Name,Content\nFirst,${LONG}`))).toThrow(/Name, Content/);
  });

  it('throws when Content is missing', () => {
    expect(() => parseDovetailCsv(csv(`Title,Notes\nFirst,${LONG}`))).toThrow(/Title, Notes/);
  });

  it('throws on an empty file', () => {
    expect(() => parseDovetailCsv(csv(''))).toThrow(/empty/i);
  });

  it('throws on a header row with no data rows', () => {
    expect(() => parseDovetailCsv(csv('Title,Content'))).toThrow(/no rows/i);
  });
});

describe('parseDovetailCsv — per-row handling', () => {
  it('skips a row with empty content and reports it', () => {
    const result = parseDovetailCsv(csv(`Title,Content\nFirst,${LONG}\nSecond,`));

    expect(result.interviews.map((i) => i.title)).toEqual(['First']);
    expect(result.skipped).toEqual([{ row: 2, title: 'Second', reason: 'no content' }]);
    expect(result.totalRows).toBe(2);
  });

  it('skips a row under the word floor and reports it', () => {
    const result = parseDovetailCsv(csv(`Title,Content\nFirst,${LONG}\nSecond,too short`));

    expect(result.interviews).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/too short/i);
  });

  it('skips a row over the Dovetail content limit and reports it', () => {
    const huge = 'word '.repeat(61_000); // over 300,000 chars
    const result = parseDovetailCsv(csv(`Title,Content\nFirst,${LONG}\nSecond,"${huge}"`));

    expect(result.interviews).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/too long/i);
  });

  it('falls back to a row label when the title is empty', () => {
    const result = parseDovetailCsv(csv(`Title,Content\n,${LONG}`));

    expect(result.interviews[0].title).toBe('Row 1');
  });

  it('never throws because of a bad row', () => {
    const body = `Title,Content\nFirst,\nSecond,short\nThird,${LONG}`;
    expect(() => parseDovetailCsv(csv(body))).not.toThrow();
    expect(parseDovetailCsv(csv(body)).interviews).toHaveLength(1);
  });

  it('reports every skipped row, not just the first', () => {
    const body = `Title,Content\nA,\nB,short\nC,${LONG}`;
    const result = parseDovetailCsv(csv(body));

    expect(result.skipped.map((s) => s.title)).toEqual(['A', 'B']);
    expect(result.totalRows).toBe(3);
  });
});
