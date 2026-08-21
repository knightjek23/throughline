/**
 * docx input.
 *
 * A .docx is a zip holding `word/document.xml`. fflate opens the container,
 * and the XML-to-text step is written here rather than delegated, because it is
 * the part that decides whether paragraphs, tabs and tracked changes survive.
 *
 * fflate over mammoth, measured: 18 files and 852KB with no dependencies,
 * against mammoth's 970 files and 9.2MB. Mammoth also converts to HTML, which
 * would then have to be converted back to text, so the heavier option does more
 * work to land further from where this needs to be.
 *
 * Two extraction rules are load-bearing and non-obvious.
 *
 * Runs concatenate with no separator. Word splits a sentence into a new
 * `<w:r>` at every formatting change, so inserting a space between runs puts
 * gaps in the middle of words throughout the document.
 *
 * Deleted text is excluded. `<w:delText>` inside `<w:del>` is content a
 * reviewer removed. Including it resurrects deleted words, which in a research
 * transcript means putting sentences back into a participant's mouth.
 */

import 'server-only';
import { unzipSync } from 'fflate';
import type { ParseResult } from './index';
import { finalize } from './finalize';
import { decodeEntities } from './markup';

const DOCUMENT_PART = 'word/document.xml';

/** OLE compound file magic. Encrypted OOXML is OLE, not zip. */
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];
/** Local file header magic for a zip. */
const ZIP_MAGIC = [0x50, 0x4b];

function startsWith(buf: Buffer, magic: number[]): boolean {
  if (buf.length < magic.length) return false;
  return magic.every((byte, i) => buf[i] === byte);
}

/** Text-bearing content removed before extraction, innermost concerns first. */
function stripNonContent(xml: string): string {
  return xml
    // Tracked deletions, whole element including its runs.
    .replace(/<w:del\b[\s\S]*?<\/w:del>/g, '')
    // Field instructions like PAGE \* MERGEFORMAT.
    .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g, '');
}

function paragraphText(xml: string): string {
  let out = '';
  // One pass over the three things that carry content, in document order.
  const token = /<w:t\b([^>]*)>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = token.exec(xml)) !== null) {
    if (match[0].startsWith('<w:tab')) {
      out += '\t';
      continue;
    }
    if (match[0].startsWith('<w:br')) {
      out += '\n';
      continue;
    }
    out += decodeEntities(match[2] ?? '');
  }

  return out;
}

export function parseDocxText(buf: Buffer): string {
  if (startsWith(buf, OLE_MAGIC)) {
    throw new Error('this .docx is password protected');
  }
  if (!startsWith(buf, ZIP_MAGIC)) {
    throw new Error('not a .docx file');
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(buf), { filter: (file) => file.name === DOCUMENT_PART });
  } catch {
    throw new Error('not a readable .docx file');
  }

  const part = entries[DOCUMENT_PART];
  if (!part) {
    throw new Error(`couldn't find the document body (${DOCUMENT_PART}) in this .docx`);
  }

  const xml = stripNonContent(Buffer.from(part).toString('utf8'));

  const paragraphs: string[] = [];
  const paragraph = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let match: RegExpExecArray | null;
  while ((match = paragraph.exec(xml)) !== null) {
    const text = paragraphText(match[1]).trim();
    // Word uses empty paragraphs for vertical spacing. They are layout, not
    // content, and emitting them would give the evidence spine blank blocks.
    if (text) paragraphs.push(text);
  }

  if (paragraphs.length === 0) {
    throw new Error('this .docx has no text in it');
  }

  return paragraphs.join('\n\n');
}

export function parseDocx(buf: Buffer): ParseResult {
  return finalize(parseDocxText(buf));
}
