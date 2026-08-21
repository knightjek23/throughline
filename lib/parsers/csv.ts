/**
 * Dovetail CSV export reader.
 *
 * Dovetail documents its import format as UTF-8 with `Title` and `Content`
 * header columns, a 300,000 character content limit, and semicolon-separated
 * multi-selects. Reading that exact shape is the difference between "we support
 * CSV" and "import your Dovetail export", which matters now that Dovetail has
 * dropped its self-serve paid tier and its users need somewhere to go.
 *
 * A CSV is not one transcript, so this returns many, and the split between
 * throwing and skipping is the contract that matters:
 *
 *   - Structural problems throw. A file with no Content column is unusable and
 *     the researcher needs to know before anything is written.
 *   - Row problems are skipped and reported. One empty row must never discard
 *     the other forty-nine.
 */

import 'server-only';
import { MAX_TRANSCRIPT_CHARS, MIN_TRANSCRIPT_WORDS } from './finalize';

/** Dovetail's documented per-record content limit. */
export const MAX_CSV_CONTENT_CHARS = 300_000;

export interface ParsedInterview {
  title: string;
  text: string;
  wordCount: number;
}

export interface SkippedRow {
  /** One-based index among data rows, matching what the user sees in a sheet. */
  row: number;
  title: string;
  reason: string;
}

export interface CsvImport {
  interviews: ParsedInterview[];
  skipped: SkippedRow[];
  /** Data rows found, including skipped ones. The import cap counts this. */
  totalRows: number;
}

/**
 * RFC 4180 reader.
 *
 * One deliberate leniency: a quote only opens a quoted field when it appears at
 * the start of a field. Mid-field quotes are literal, so `5" screen` survives
 * instead of swallowing the rest of the file. Real writers always quote the
 * whole field, so this only ever affects malformed input.
 */
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStart = true;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      fieldStart = true;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fieldStart = true;
      continue;
    }

    field += char;
    fieldStart = false;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function parseDovetailCsv(buf: Buffer): CsvImport {
  const text = buf.toString('utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
  if (!text) throw new Error('this file is empty');

  const rows = readCsv(text);
  if (rows.length === 0) throw new Error('this file is empty');

  const headers = rows[0].map((cell) => cell.trim());
  const lower = headers.map((cell) => cell.toLowerCase());
  const titleIndex = lower.indexOf('title');
  const contentIndex = lower.indexOf('content');

  if (titleIndex === -1 || contentIndex === -1) {
    throw new Error(
      `this CSV needs Title and Content columns. Found: ${headers.join(', ')}`,
    );
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) throw new Error('this CSV has headers but no rows');

  const interviews: ParsedInterview[] = [];
  const skipped: SkippedRow[] = [];

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 1;
    const rawTitle = (cells[titleIndex] ?? '').trim();
    // A blank title is normal in exports. Naming the row keeps the interview
    // addressable rather than nameless.
    const title = rawTitle || `Row ${rowNumber}`;
    const content = (cells[contentIndex] ?? '').trim();

    if (!content) {
      skipped.push({ row: rowNumber, title, reason: 'no content' });
      return;
    }
    if (content.length > MAX_CSV_CONTENT_CHARS || content.length > MAX_TRANSCRIPT_CHARS) {
      skipped.push({ row: rowNumber, title, reason: 'too long to analyze' });
      return;
    }

    const wordCount = countWords(content);
    if (wordCount < MIN_TRANSCRIPT_WORDS) {
      skipped.push({
        row: rowNumber,
        title,
        reason: `too short to analyze (<${MIN_TRANSCRIPT_WORDS} words)`,
      });
      return;
    }

    interviews.push({ title, text: content, wordCount });
  });

  return { interviews, skipped, totalRows: dataRows.length };
}
