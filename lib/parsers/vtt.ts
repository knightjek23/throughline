/**
 * WEBVTT input.
 *
 * Reduces a caption file to a cue list and hands off to cuesToProse, which owns
 * the prose rules including rolling-caption deduplication. Timestamps and cue
 * identifiers are dropped here; see cues.ts for why.
 */

import 'server-only';
import type { ParseResult } from './index';
import { finalize } from './finalize';
import { cuesToProse, type Cue } from './cues';
import { collapse, decodeEntities, stripTags } from './markup';

/** Blocks that carry metadata rather than speech. */
const METADATA_BLOCK = /^(NOTE|STYLE|REGION)\b/;

/** A voice span: <v Speaker>, or <v.class.class Speaker>. */
const VOICE_TAG = /^<v([^>]*)>/i;

export function parseVttCues(raw: string): Cue[] {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
  if (!/^WEBVTT\b/.test(text)) {
    throw new Error('not a WEBVTT file: missing the WEBVTT header');
  }

  const cues: Cue[] = [];

  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    if (lines.length === 0) continue;
    if (/^WEBVTT\b/.test(lines[0])) continue;
    if (METADATA_BLOCK.test(lines[0].trim())) continue;

    // The timestamp line is the only reliable marker of a cue. Anything before
    // it is a cue identifier, which carries no speech.
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) continue;

    let payload = lines.slice(timingIndex + 1).join(' ');
    if (!payload.trim()) continue;

    let speaker: string | null = null;
    const voice = payload.match(VOICE_TAG);
    if (voice) {
      // Tag content is ".loud.first Interviewer" or " Participant". Classes are
      // styling, so drop them and keep the name.
      const name = voice[1].replace(/^(\.[^\s.]+)*/, '').trim();
      speaker = name || null;
      payload = payload.slice(voice[0].length);
    }

    // Strip markup before decoding entities. See markup.ts for why the order
    // is load-bearing.
    payload = collapse(decodeEntities(stripTags(payload)));
    if (!payload) continue;

    cues.push({ speaker, text: payload });
  }

  if (cues.length === 0) {
    throw new Error("couldn't find any captions in this file");
  }

  return cues;
}

export function parseVtt(buf: Buffer): ParseResult {
  return finalize(cuesToProse(parseVttCues(buf.toString('utf8'))));
}
