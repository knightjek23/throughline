/**
 * Day 8 Task 6: extension-first routing.
 *
 * The old router trusted the MIME header first. That inverts for the new types
 * because browsers are unreliable here in specific, well-known ways: .csv
 * commonly arrives as application/vnd.ms-excel and .srt frequently arrives with
 * an empty type. Extension leads, MIME breaks ties, and the parser has the
 * final say because content that does not parse is rejected regardless.
 */

import { describe, it, expect } from 'vitest';
import { parseTranscript, isImportType, storageExtension, SUPPORTED_MIMES } from '@/lib/parsers';
import { zipSync, strToU8 } from 'fflate';

const LONG = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');

const TXT = Buffer.from(LONG, 'utf8');
const VTT = Buffer.from(`WEBVTT\n\n00:00:01.000 --> 00:00:09.000\n${LONG}`, 'utf8');
const SRT = Buffer.from(`1\n00:00:01,000 --> 00:00:09,000\n${LONG}`, 'utf8');
const DOCX = Buffer.from(
  zipSync({
    'word/document.xml': strToU8(
      `<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>${LONG}</w:t></w:r></w:p></w:body></w:document>`,
    ),
  }),
);

describe('parseTranscript — extension leads', () => {
  it('routes .vtt even when the MIME type is empty', async () => {
    const result = await parseTranscript(VTT, '', 'interview.vtt');
    expect(result.wordCount).toBe(60);
  });

  it('routes .srt even when the MIME type is empty', async () => {
    const result = await parseTranscript(SRT, '', 'interview.srt');
    expect(result.wordCount).toBe(60);
  });

  it('routes .docx', async () => {
    const result = await parseTranscript(DOCX, '', 'interview.docx');
    expect(result.wordCount).toBe(60);
  });

  it('routes .txt', async () => {
    const result = await parseTranscript(TXT, 'text/plain', 'interview.txt');
    expect(result.wordCount).toBe(60);
  });

  it('prefers the extension when extension and MIME disagree', async () => {
    // A .vtt served as text/plain must still be read as captions, or the
    // timestamps end up in the transcript.
    const result = await parseTranscript(VTT, 'text/plain', 'interview.vtt');
    expect(result.text).not.toContain('-->');
  });

  it('falls back to MIME when the extension is unknown', async () => {
    const result = await parseTranscript(TXT, 'text/plain', 'interview');
    expect(result.wordCount).toBe(60);
  });
});

describe('parseTranscript — CSV belongs to import', () => {
  it('recognises a CSV and points at the import path rather than parsing it', async () => {
    await expect(
      parseTranscript(Buffer.from('Title,Content\na,b', 'utf8'), 'text/csv', 'export.csv'),
    ).rejects.toThrow(/import/i);
  });

  it('recognises a CSV sent as application/vnd.ms-excel', () => {
    expect(isImportType('application/vnd.ms-excel', 'export.csv')).toBe(true);
  });

  it('does not treat a txt file as an import', () => {
    expect(isImportType('text/plain', 'interview.txt')).toBe(false);
  });
});

describe('parseTranscript — rejection', () => {
  it('names the supported types when both signals are unknown', async () => {
    await expect(parseTranscript(TXT, 'application/pdf', 'interview.pdf')).rejects.toThrow(
      /\.txt.*\.vtt.*\.srt.*\.docx.*\.csv/s,
    );
  });

  it('rejects content that does not parse as its claimed type', async () => {
    await expect(parseTranscript(TXT, '', 'interview.vtt')).rejects.toThrow(/WEBVTT/i);
  });
});

describe('storageExtension', () => {
  it('derives the extension from the validated format, not the filename', () => {
    expect(storageExtension('text/vtt', 'transcript.vtt')).toBe('vtt');
    expect(storageExtension('text/plain', 'notes')).toBe('txt');
  });

  it('prefers the extension when the two disagree, matching the router', () => {
    expect(storageExtension('text/plain', 'captions.srt')).toBe('srt');
  });

  it('throws rather than guessing for an unknown type', () => {
    expect(() => storageExtension('application/pdf', 'report.pdf')).toThrow(/unsupported/i);
  });
});

describe('SUPPORTED_MIMES', () => {
  it('covers every type the router accepts', () => {
    expect(SUPPORTED_MIMES.has('text/plain')).toBe(true);
    expect(SUPPORTED_MIMES.has('text/vtt')).toBe(true);
    expect(SUPPORTED_MIMES.has('application/x-subrip')).toBe(true);
    expect(SUPPORTED_MIMES.has('text/csv')).toBe(true);
  });
});
