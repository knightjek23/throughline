/**
 * Transcript parser registry. Day 2: wire in vtt/srt/docx implementations.
 * Each parser returns cleaned plain text + word count + an error if rejected.
 */

import 'server-only';
import { parseTxt } from './txt';

export interface ParseResult {
  text: string;
  wordCount: number;
}

export type SupportedMime =
  | 'text/plain'
  | 'text/vtt'
  | 'application/x-subrip'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const SUPPORTED_MIMES: ReadonlySet<SupportedMime> = new Set([
  'text/plain',
  'text/vtt',
  'application/x-subrip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export async function parseTranscript(buf: Buffer, mime: string, filename: string): Promise<ParseResult> {
  // Trust the MIME header — but defense in depth: extension as a tiebreaker.
  const ext = (filename.split('.').pop() ?? '').toLowerCase();

  if (mime === 'text/plain' || ext === 'txt')   return parseTxt(buf);

  // Day 2: vtt / srt / docx
  if (mime === 'text/vtt' || ext === 'vtt')     throw new Error('vtt parser: not implemented (Day 2)');
  if (mime === 'application/x-subrip' || ext === 'srt') throw new Error('srt parser: not implemented (Day 2)');
  if (ext === 'docx')                            throw new Error('docx parser: not implemented (Day 2)');

  throw new Error(`unsupported file type: ${mime} (${filename})`);
}
