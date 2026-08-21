/**
 * Transcript parser registry.
 *
 * Routing is extension-first, MIME second, parser last.
 *
 * The original order trusted MIME and used the extension as a tiebreaker, which
 * works when there is one accepted type and stops working the moment there are
 * five. Browsers and operating systems disagree about the new ones in specific,
 * well-documented ways: `.csv` commonly arrives as `application/vnd.ms-excel`,
 * `.srt` frequently arrives with an empty type, and `.vtt` varies by platform.
 * The extension is the user's stated intent and is the more reliable signal.
 *
 * The parser is the final authority either way. A file whose content does not
 * parse as its claimed type is rejected on content, so a lying extension buys
 * nothing.
 */

import 'server-only';
import { parseTxt } from './txt';
import { parseVtt } from './vtt';
import { parseSrt } from './srt';
import { parseDocx } from './docx';

export interface ParseResult {
  text: string;
  wordCount: number;
}

export type SupportedMime =
  | 'text/plain'
  | 'text/vtt'
  | 'application/x-subrip'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'text/csv'
  | 'application/csv'
  | 'application/vnd.ms-excel';

export const SUPPORTED_MIMES: ReadonlySet<SupportedMime> = new Set<SupportedMime>([
  'text/plain',
  'text/vtt',
  'application/x-subrip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
]);

/** Types that carry many interviews and belong to the import route. */
export const IMPORT_MIMES: ReadonlySet<string> = new Set([
  'text/csv',
  'application/csv',
  // Excel's type is what a lot of browsers send for a .csv on Windows.
  'application/vnd.ms-excel',
]);

const SUPPORTED_EXTENSIONS = ['.txt', '.vtt', '.srt', '.docx', '.csv'] as const;

type Format = 'txt' | 'vtt' | 'srt' | 'docx' | 'csv';

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

function formatFromExtension(filename: string): Format | null {
  switch (extensionOf(filename)) {
    case 'txt':
      return 'txt';
    case 'vtt':
      return 'vtt';
    case 'srt':
      return 'srt';
    case 'docx':
      return 'docx';
    case 'csv':
      return 'csv';
    default:
      return null;
  }
}

function formatFromMime(mime: string): Format | null {
  if (IMPORT_MIMES.has(mime)) return 'csv';
  switch (mime) {
    case 'text/plain':
      return 'txt';
    case 'text/vtt':
      return 'vtt';
    case 'application/x-subrip':
      return 'srt';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    default:
      return null;
  }
}

function resolveFormat(mime: string, filename: string): Format | null {
  return formatFromExtension(filename) ?? formatFromMime(mime);
}

/**
 * The extension the stored object should carry, derived from the validated
 * format rather than the user-supplied filename. A filename is user input; the
 * storage path is not the place to trust it.
 */
export function storageExtension(mime: string, filename: string): Format {
  const format = resolveFormat(mime, filename);
  if (!format) throw new Error(`unsupported file type: ${mime || 'unknown'} (${filename})`);
  return format;
}

/** True when this upload is a multi-interview import rather than one transcript. */
export function isImportType(mime: string, filename: string): boolean {
  return resolveFormat(mime, filename) === 'csv';
}

export async function parseTranscript(
  buf: Buffer,
  mime: string,
  filename: string,
): Promise<ParseResult> {
  const format = resolveFormat(mime, filename);

  switch (format) {
    case 'txt':
      return parseTxt(buf);
    case 'vtt':
      return parseVtt(buf);
    case 'srt':
      return parseSrt(buf);
    case 'docx':
      return parseDocx(buf);
    case 'csv':
      // Recognised, but a CSV holds many interviews and cannot come down the
      // single-transcript path. The route sends the user to import instead.
      throw new Error('this looks like a CSV. Use import to bring in several interviews at once');
    default:
      throw new Error(
        `unsupported file type: ${mime || 'unknown'} (${filename}). Throughline reads ${SUPPORTED_EXTENSIONS.join(', ')} files`,
      );
  }
}
