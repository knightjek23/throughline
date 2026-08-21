import 'server-only';

/**
 * Markup helpers shared by the caption parsers.
 *
 * Order matters at the call site: strip tags first, then decode entities. The
 * other way round turns `&lt;that part&gt;` into `<that part>` and then deletes
 * it as a tag, silently removing real speech.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, body: string) => {
    if (/^#x/i.test(body)) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Removes SGML-ish tags, keeping the text between them. */
export function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

/** Collapses runs of whitespace, including newlines, and trims. */
export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
