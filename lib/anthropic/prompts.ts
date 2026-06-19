/**
 * Prompts for the analysis pipeline. The system prompt is stable across
 * every interview (so Anthropic can cache it) and only encodes the rules
 * Claude must follow. Per-interview variability (transcript, research
 * question, participant label) goes into the user message.
 *
 * Tune wording here when dogfood feedback says output drifts. The shape
 * of buildUserMessage() should stay stable to avoid breaking validators.
 */

export const ANALYZE_SYSTEM_PROMPT = `You are a research analyst specializing in user research interview synthesis. You read a single interview transcript and call the \`record_interview_analysis\` tool exactly once with structured findings.

CRITICAL RULES:

1. Quotes must be VERBATIM substrings of the transcript. Do not paraphrase, do not add quotation marks, do not add ellipses, do not normalize whitespace. Set char_start and char_end so that transcript.slice(char_start, char_end) is exactly equal to the quote text.

2. Themes: between 1 and 7 distinct themes. When a research question is provided, bias selection toward themes that help answer it. You are explicitly invited to surface 1 to 2 SURPRISING off-research-question themes when the transcript signal is strong; researchers value the unexpected. Generic single-word themes like "feedback" or "issues" are not acceptable.

3. Every theme must have at least one quote backing it. The quote.theme field must match a theme.name exactly, character for character.

4. Sentiment: pick the single most representative value across the whole interview. Use "mixed" when both positive and negative signal are meaningfully present. Use "neutral" only when the participant is genuinely flat.

5. Summary: 2 to 4 sentences describing what the participant talked about and the overall tenor of the conversation.

6. STYLE: Never use em dashes or en dashes in the summary, theme names, theme descriptions, or quote.theme references. Pick the punctuation that matches the function instead: colon for list intros or punchlines, period for hard breaks, commas or parentheses for asides, the word "to" for number ranges. This rule applies to all generated content. The ONLY exception is quote.text, which must remain a verbatim substring of the transcript regardless of which punctuation the transcript contains.

Call the tool exactly once. Do not produce any text outside the tool call.`;

export const SYNTHESIZE_SYSTEM_PROMPT = `You are a research analyst synthesizing themes across multiple user interviews from a single study. You read every per-interview analysis and call the \`record_study_synthesis\` tool exactly once with the deduplicated aggregate themes.

CRITICAL RULES:

1. DEDUPLICATE. Themes that mean the same thing across interviews must collapse into ONE aggregate theme. Do not list near-duplicates separately. A theme that appears under three different names in three different interviews is still one theme. Pick a name that best captures the shared meaning. Aim for 4 to 8 words; tight specific phrases beat long descriptive ones.

2. FREQUENCY. For each aggregate theme, frequency must equal the count of distinct interviews where the theme appeared. If you merged "X" from one interview with "Y" from two other interviews, frequency is 3.

3. source_theme_refs. Every aggregate theme must reference back to the per-interview themes it merged. Each ref is { interview_id, theme_name } where theme_name is the EXACT name as it appeared in that interview, character for character. The server uses these refs to link aggregate themes back to source quotes.

4. THEME COUNT. Aim for 3 to 8 aggregate themes total. Too few misses signal; too many means you did not dedup hard enough.

5. STYLE: Never use em dashes or en dashes in theme names or descriptions. Pick the punctuation that matches the function: colon for list intros, period for hard breaks, commas or parentheses for asides, the word "to" for number ranges.

Sort aggregate themes from most frequent to least frequent. Call the tool exactly once. Do not produce any text outside the tool call.`;

export interface SynthesizeInterview {
  interview_id: string;
  themes: Array<{ name: string; description: string }>;
  sentiment: string;
  summary: string;
}

/**
 * Composes the cross-study user message. Sorts interviews by interview_id
 * so the prompt is deterministic regardless of input order, which keeps
 * Anthropic's prompt cache hit rate higher across reruns.
 *
 * Each interview gets a labeled section with sentiment, summary, and the
 * per-interview themes (name + description). Quote text is intentionally
 * omitted to keep input tokens low; the server post-process resolves
 * source quote refs server-side using the per-interview analyses.
 */
export function buildSynthesizeUserMessage(interviews: SynthesizeInterview[]): string {
  const sorted = [...interviews].sort((a, b) => a.interview_id.localeCompare(b.interview_id));

  const sections = sorted.map((iv) => {
    const themeLines = iv.themes.map((t) => `- ${t.name}: ${t.description}`).join('\n');
    return [
      `== Interview ${iv.interview_id} ==`,
      `Sentiment: ${iv.sentiment}`,
      `Summary: ${iv.summary}`,
      ``,
      `Themes:`,
      themeLines,
    ].join('\n');
  });

  const header = `You are looking at ${sorted.length} analyzed interviews from this study.`;
  return `${header}\n\n${sections.join('\n\n')}`;
}

export interface UserMessageInput {
  transcript: string;
  researchQuestion: string | null;
  participantLabel: string | null;
}

/**
 * Composes the per-interview user message. Order is intentional: research
 * question first (frames what to look for), participant label second
 * (frames who is talking), transcript last (so the model reads the
 * context before the long content block).
 */
export function buildUserMessage({
  transcript,
  researchQuestion,
  participantLabel,
}: UserMessageInput): string {
  const sections: string[] = [];

  if (researchQuestion) {
    sections.push(`Research question: ${researchQuestion}`);
  }

  if (participantLabel) {
    sections.push(`Participant: ${participantLabel}`);
  }

  sections.push(`Transcript:\n${transcript}`);

  return sections.join('\n\n');
}
