/**
 * Text normalization helpers shared across the Anthropic pipeline.
 *
 * Both `validateAndPrune` (per-interview) and `synthesizeStudy` (cross-study)
 * need to strip em and en dashes from generated text fields so the surfaced
 * analysis never reads as AI-generated. Centralizing the logic here means
 * the rule is enforced identically across both pipelines.
 *
 * See [[feedback-no-em-dash]] for the rationale.
 */

/**
 * Removes em dashes (—), en dashes (–), and spaced double hyphens (--)
 * from text by replacing with punctuation that matches the function.
 *
 * - Number ranges ("4—5", "12–15") become "X to Y"
 * - All other em/en dashes and spaced double hyphens collapse to ", "
 * - Resulting double commas and double spaces are deduped
 * - Leading and trailing whitespace is trimmed
 *
 * Plain hyphens in compound words (real-time, end-to-end) are preserved.
 *
 * This is approximate by design. The model is also instructed not to
 * produce em dashes in the first place via the system prompt; this is
 * the belt-and-suspenders post-process.
 */
export function stripEmDashes(text: string): string {
  return text
    .replace(/(\d)\s*[—–]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+--\s+/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}
