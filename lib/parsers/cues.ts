/**
 * Cue lists to speaker-labelled prose.
 *
 * VTT and SRT are the same thing in different clothing: a list of cues with a
 * time range, optional speaker, and text. Both parsers reduce to `Cue[]` and
 * hand off here, so the prose rules live in one tested place.
 *
 * Timestamps are dropped. What comes out is what `transcript_text` holds, which
 * is what the model quotes from and what the evidence spine's character offsets
 * address, so timecodes in the text would end up inside every citation. A
 * cue-to-offset index is the v1.1 answer if audio jump-back ever lands.
 *
 * The non-obvious part is rolling captions. Auto-generated captions from
 * YouTube, Zoom and Teams repeat the tail of the previous cue so the text
 * scrolls on screen:
 *
 *   the onboarding
 *   the onboarding flow lost
 *   flow lost me at the second
 *
 * Concatenated naively that is roughly three times the real transcript, which
 * inflates the word count, the token spend, and every character offset the
 * evidence spine depends on. So each incoming cue is checked for a repeated
 * head against the accumulated tail, and the repeat is trimmed.
 */

export interface Cue {
  speaker: string | null;
  text: string;
}

/**
 * Words of overlap required before trimming. Two, not three: a rolling caption
 * often only carries two words forward ("the onboarding"), so three misses the
 * common case. One is too loose, because a word ending one cue and starting the
 * next is ordinary speech ("...about the flow" / "flow charts are...").
 *
 * The trade-off is deliberate and asymmetric. A genuine repeated two-word
 * phrase across a cue boundary loses two words; a missed rolling overlap
 * triples the transcript. Leaving a duplicated word is the safe failure.
 */
const MIN_OVERLAP_WORDS = 2;

/** Lowercased and stripped of edge punctuation, for comparison only. */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/**
 * Number of words at the end of `previous` that repeat at the start of `next`.
 * Returns 0 when there is no overlap worth trimming. Greedy: the longest match
 * wins, so a cue that entirely repeats the tail is dropped rather than halved.
 */
function overlapWordCount(previous: string[], next: string[]): number {
  const max = Math.min(previous.length, next.length);
  for (let k = max; k >= MIN_OVERLAP_WORDS; k--) {
    let matches = true;
    for (let i = 0; i < k; i++) {
      if (normalizeWord(previous[previous.length - k + i]) !== normalizeWord(next[i])) {
        matches = false;
        break;
      }
    }
    if (matches) return k;
  }
  return 0;
}

export function cuesToProse(cues: Cue[]): string {
  const blocks: string[] = [];

  let speaker: string | null = null;
  let words: string[] = [];

  function flush() {
    if (words.length === 0) return;
    const text = words.join(' ');
    blocks.push(speaker ? `${speaker}: ${text}` : text);
    words = [];
  }

  for (const cue of cues) {
    const text = cue.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const cueSpeaker = cue.speaker?.trim() || null;

    // A cue with no speaker continues the current turn. VTT commonly tags only
    // the first cue of a turn with <v Speaker>, so treating null as a change
    // would shred every turn into one block per cue.
    if (cueSpeaker !== null && cueSpeaker !== speaker) {
      flush();
      speaker = cueSpeaker;
    }

    const incoming = text.split(' ');
    if (words.length === 0) {
      words = incoming;
      continue;
    }

    // Overlap is only trimmed within a turn. The same words from two speakers
    // is an exchange, not a repeat, and the speaker change already flushed.
    const overlap = overlapWordCount(words, incoming);
    words.push(...incoming.slice(overlap));
  }

  flush();
  return blocks.join('\n\n');
}
