/**
 * Day 8 Task 4: docx input.
 *
 * Fixtures are real zip containers built with fflate, not mocks, so the test
 * exercises the same path a file from Word or Google Docs takes.
 */

import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseDocxText, parseDocx } from '@/lib/parsers/docx';

const DOC_OPEN =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
const DOC_CLOSE = '</w:body></w:document>';

/** Wraps body XML in a minimal but genuine OOXML package. */
function docx(bodyXml: string): Buffer {
  const zipped = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships/>'),
    'word/document.xml': strToU8(DOC_OPEN + bodyXml + DOC_CLOSE),
  });
  return Buffer.from(zipped);
}

function para(...runs: string[]): string {
  return `<w:p>${runs.map((r) => `<w:r>${r}</w:r>`).join('')}</w:p>`;
}

function t(text: string, preserve = false): string {
  return `<w:t${preserve ? ' xml:space="preserve"' : ''}>${text}</w:t>`;
}

describe('parseDocxText — paragraphs', () => {
  it('extracts two paragraphs separated by a blank line', () => {
    const text = parseDocxText(docx(para(t('First paragraph')) + para(t('Second paragraph'))));

    expect(text).toBe('First paragraph\n\nSecond paragraph');
  });

  it('concatenates runs inside one paragraph without inserting a space', () => {
    // Word splits a sentence into runs at every formatting change, so an
    // inserted space here would put gaps mid-word throughout the document.
    const text = parseDocxText(docx(para(t('onboard'), t('ing'), t(' flow'))));

    expect(text).toBe('onboarding flow');
  });

  it('keeps leading and trailing spaces on xml:space="preserve" runs', () => {
    const text = parseDocxText(docx(para(t('I opened it', true), t(' and gave up', true))));

    expect(text).toBe('I opened it and gave up');
  });

  it('drops empty paragraphs rather than emitting blank blocks', () => {
    const text = parseDocxText(docx(para(t('First')) + '<w:p/>' + para(t('Second'))));

    expect(text).toBe('First\n\nSecond');
  });

  it('turns w:tab into a tab and w:br into a newline inside the paragraph', () => {
    const text = parseDocxText(docx(para(t('Q:'), '<w:tab/>', t('the answer'), '<w:br/>', t('continued'))));

    expect(text).toBe('Q:\tthe answer\ncontinued');
  });

  it('decodes XML entities', () => {
    const text = parseDocxText(docx(para(t('setup &amp; onboarding &#39;broke&#39;'))));

    expect(text).toBe("setup & onboarding 'broke'");
  });

  it('reads paragraphs carrying attributes', () => {
    const body = '<w:p w14:paraId="12345678" w:rsidR="00A1"><w:r><w:t>Attributed</w:t></w:r></w:p>';
    expect(parseDocxText(docx(body))).toBe('Attributed');
  });
});

describe('parseDocxText — tracked changes', () => {
  it('excludes deleted text', () => {
    // w:delText is text a reviewer removed. Including it resurrects content the
    // author deleted, which would put words in a participant's mouth.
    const body =
      '<w:p><w:r><w:t>I opened it </w:t></w:r>' +
      '<w:del><w:r><w:delText>and loved it</w:delText></w:r></w:del>' +
      '<w:r><w:t>and gave up</w:t></w:r></w:p>';

    expect(parseDocxText(docx(body))).toBe('I opened it and gave up');
  });

  it('includes inserted text', () => {
    const body =
      '<w:p><w:r><w:t>I opened it </w:t></w:r>' +
      '<w:ins><w:r><w:t>on my phone</w:t></w:r></w:ins></w:p>';

    expect(parseDocxText(docx(body))).toBe('I opened it on my phone');
  });

  it('excludes field instruction text', () => {
    const body =
      '<w:p><w:r><w:instrText>PAGE \\* MERGEFORMAT</w:instrText></w:r>' +
      '<w:r><w:t>Real text</w:t></w:r></w:p>';

    expect(parseDocxText(docx(body))).toBe('Real text');
  });
});

describe('parseDocxText — rejection', () => {
  it('throws when the buffer is not a zip', () => {
    expect(() => parseDocxText(Buffer.from('this is just text', 'utf8'))).toThrow(/\.docx/i);
  });

  it('throws when the zip has no word/document.xml', () => {
    const zipped = zipSync({ 'notes.txt': strToU8('hello') });
    expect(() => parseDocxText(Buffer.from(zipped))).toThrow(/document/i);
  });

  it('throws a protection-specific message for an encrypted package', () => {
    // Encrypted OOXML is an OLE compound file, not a zip. Its magic bytes are
    // the only signal available before decryption.
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    expect(() => parseDocxText(ole)).toThrow(/password protected/i);
  });

  it('throws when the document body has no text at all', () => {
    expect(() => parseDocxText(docx('<w:p/>'))).toThrow(/no text/i);
  });
});

describe('parseDocx — end to end', () => {
  it('applies the shared guards and counts words', () => {
    // Six words per paragraph: "Paragraph N with five more words".
    const body = Array.from({ length: 12 }, (_, i) =>
      para(t(`Paragraph ${i} with five more words`)),
    ).join('');

    const result = parseDocx(docx(body));

    expect(result.wordCount).toBe(12 * 6);
    expect(result.text.split('\n\n')).toHaveLength(12);
  });

  it('rejects a document under the shared word floor', () => {
    expect(() => parseDocx(docx(para(t('too short'))))).toThrow(/too short/i);
  });
});
