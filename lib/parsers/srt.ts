/**
 * SubRip input.
 *
 * Same shape as VTT: reduce to a cue list, hand off to cuesToProse. The one
 * real difference is attribution. SRT has no speaker field, so the only signal
 * is the "NAME:" convention, which collides with ordinary speech ("...was
 * this: it never explained itself"). The lift is therefore conservative:
 * at most four words, every word starting with an uppercase letter, no digits.
 * A missed speaker label costs attribution; a wrong one silently reassigns a
 * quote to the wrong person, which is worse in a research tool.
 */

import 'server-only';
import type { ParseResult } from './index';
import { finalize } from './finalize';
import { cuesToProse, type Cue } from './cues';
import { collapse, decodeEntities, stripTags } from './markup';

/** ASS/SSA position overrides that leak into SRT files. */
const POSITION_OVERRIDE = /\{\\[^}]*\}/g;

/** A leading dash marks a dialogue turn rather than speech. */
const DIALOGUE_DASH = /^[-–—]\s+/;

const SPEAKER_PREFIX = /^([^:]{1,40}):\s+(.+)$/;
const NAME_WORD = /^\p{Lu}[\p{L}'’.-]*$/u;

function looksLikeName(candidate: string): boolean {
  const words = candidate.trim().split(/\s+/);
  if (words.length === 0 || words.length > 4) return false;
  return words.every((word) => NAME_WORD.test(word));
}

export function parseSrtCues(raw: string): Cue[] {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
  const cues: Cue[] = [];

  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    if (lines.length === 0) continue;

    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) continue;

    let payload = lines.slice(timingIndex + 1).join(' ');
    payload = payload.replace(POSITION_OVERRIDE, '');
    payload = collapse(decodeEntities(stripTags(payload)));
    payload = payload.replace(DIALOGUE_DASH, '');
    if (!payload) continue;

    let speaker: string | null = null;
    const prefixed = payload.match(SPEAKER_PREFIX);
    if (prefixed && looksLikeName(prefixed[1])) {
      speaker = prefixed[1].trim();
      payload = prefixed[2].trim();
    }

    cues.push({ speaker, text: payload });
  }

  if (cues.length === 0) {
    throw new Error("couldn't find any captions in this file");
  }

  return cues;
}

export function parseSrt(buf: Buffer): ParseResult {
  return finalize(cuesToProse(parseSrtCues(buf.toString('utf8'))));
}
