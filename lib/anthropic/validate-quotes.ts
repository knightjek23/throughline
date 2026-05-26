/**
 * Quote substring validation + orphan theme pruning.
 *
 * Pure function. Takes the Anthropic model's analysis (already Zod-parsed)
 * plus the original transcript and returns a cleaned version where:
 *
 *  1. Every quote has been verified to exist verbatim in the transcript.
 *     If `transcript.slice(char_start, char_end) !== text` we try once
 *     more via `indexOf(text)` to fix off-by-N positions before giving up.
 *  2. Quotes whose `theme` field doesn't match a real theme.name are
 *     dropped — they're orphaned in a different way (phantom theme).
 *  3. Themes with zero surviving quotes are pruned. Every shipping theme
 *     is grounded by at least one validated quote.
 *
 * If no themes survive pruning, throws `NoGroundedThemesError` — the
 * caller (job handler) writes the failure_reason and marks the interview
 * as failed.
 *
 * Drop counts surface in the return value so the caller can emit a
 * single PostHog event with userId attached. Telemetry stays out of
 * this file to keep it pure and testable.
 */

import type { InterviewAnalysis } from './schemas';
import { NoGroundedThemesError } from './errors';

export interface ValidateResult {
  cleaned: InterviewAnalysis;
  droppedQuotes: number;
  droppedThemes: number;
}

type Quote = InterviewAnalysis['quotes'][number];

/**
 * Strips em and en dashes from generated text so the analysis surface
 * never reads as AI-generated. Applied to summary, theme.name,
 * theme.description, and quote.theme (the reference, not quote.text
 * which must stay verbatim).
 *
 * Number ranges become "X to Y". Everything else collapses to a comma,
 * which is approximate but always grammatically valid. The model is
 * also instructed in the system prompt not to produce these in the
 * first place; this is the belt-and-suspenders pass.
 */
function stripEmDashes(text: string): string {
  return text
    .replace(/(\d)\s*[—–]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+--\s+/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateAndPrune(
  analysis: InterviewAnalysis,
  transcript: string,
): ValidateResult {
  // Normalize generated text fields first. Symmetric strip on theme.name and
  // quote.theme keeps their membership check intact below. quote.text stays
  // untouched because it must remain a verbatim transcript substring.
  const normalized: InterviewAnalysis = {
    ...analysis,
    summary: stripEmDashes(analysis.summary),
    themes: analysis.themes.map((t) => ({
      name: stripEmDashes(t.name),
      description: stripEmDashes(t.description),
    })),
    quotes: analysis.quotes.map((q) => ({ ...q, theme: stripEmDashes(q.theme) })),
  };

  const themeNames = new Set(normalized.themes.map((t) => t.name));
  let droppedQuotes = 0;

  // Pass 1: per-quote validation. Operates on the normalized quotes so
  // theme references match the dash-stripped theme names.
  const survivingQuotes: Quote[] = [];
  for (const q of normalized.quotes) {
    // Orphan by phantom theme: quote claims a theme that wasn't declared.
    if (!themeNames.has(q.theme)) {
      droppedQuotes++;
      continue;
    }

    // Best case: positions are already correct.
    if (transcript.slice(q.char_start, q.char_end) === q.text) {
      survivingQuotes.push(q);
      continue;
    }

    // Fallback: text exists somewhere else in the transcript, fix the positions.
    const foundAt = transcript.indexOf(q.text);
    if (foundAt >= 0) {
      survivingQuotes.push({
        ...q,
        char_start: foundAt,
        char_end: foundAt + q.text.length,
      });
      continue;
    }

    // Quote is not a substring of the transcript at all. Drop.
    droppedQuotes++;
  }

  // Pass 2: prune themes with no surviving quotes (includes themes that had
  // zero quotes from the model in the first place).
  const survivingThemeNames = new Set(survivingQuotes.map((q) => q.theme));
  const survivingThemes = normalized.themes.filter((t) => survivingThemeNames.has(t.name));
  const droppedThemes = normalized.themes.length - survivingThemes.length;

  if (survivingThemes.length === 0) {
    throw new NoGroundedThemesError();
  }

  return {
    cleaned: {
      summary: normalized.summary,
      sentiment: normalized.sentiment,
      themes: survivingThemes,
      quotes: survivingQuotes,
    },
    droppedQuotes,
    droppedThemes,
  };
}
