/**
 * Aggregate cross-interview synthesis service.
 *
 * Pipeline (per Day 4 spec):
 *   1. Refuse to run with fewer than 3 interviews (the trigger gate is in
 *      the job handler, but this defense catches programmer error).
 *   2. Build the per-interview prompt input (themes + sentiment + summary,
 *      NO quote text — cost optimization, see spec).
 *   3. Call Anthropic with the record_study_synthesis tool forced.
 *      Wrapped in withRetry: one shot on 5xx or network blips.
 *   4. Extract the tool_use block. If missing or schema-invalid, throw
 *      InvalidAnalysisFormatError.
 *   5. Strip em dashes from theme names and descriptions.
 *   6. Resolve source_theme_refs into source_quote_refs (storage shape).
 *      For each model-returned ref {interview_id, theme_name}, look up the
 *      matching per-interview theme and pick its first quote_index. Refs
 *      that don't resolve get dropped; themes that lose all refs get
 *      pruned. Frequency is server-recomputed as the count of distinct
 *      surviving interview_ids per aggregate theme.
 *   7. If zero themes survive, throw NoGroundedThemesError.
 *   8. Final shape validation against studyThemesSchema.
 *
 * Pure service: no DB I/O. The caller (job handler) fetches the per-
 * interview analyses and upserts the result into study_themes.
 */

import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getAnthropic, MODEL, withRetry } from './client';
import { studyThemesSchema, type StudyThemes } from './schemas';
import { recordStudySynthesisTool } from './synthesize-tool';
import {
  SYNTHESIZE_SYSTEM_PROMPT,
  buildSynthesizeUserMessage,
  type SynthesizeInterview,
} from './prompts';
import { stripEmDashes } from './text-normalize';
import { InvalidAnalysisFormatError, NoGroundedThemesError } from './errors';
import { logger } from '../logger';

const MAX_OUTPUT_TOKENS = 4096;
const TEMPERATURE = 0;
const MIN_INTERVIEWS = 3;

type Sentiment = 'positive' | 'mixed' | 'negative' | 'neutral';

/**
 * Per-interview input shape consumed by synthesizeStudy. Built by the
 * job handler from analyzed `interview_analyses` rows.
 */
export interface SynthesizeStudyInterview {
  interview_id: string;
  themes: Array<{ name: string; description: string }>;
  sentiment: Sentiment;
  summary: string;
  quotes: Array<{ text: string; theme: string; char_start: number; char_end: number }>;
}

export interface SynthesizeStudyInput {
  interviews: SynthesizeStudyInterview[];
}

export interface SynthesizeStudyResult {
  themes: StudyThemes['themes'];
  inputTokens: number;
  outputTokens: number;
  droppedThemes: number;
}

/**
 * Schema for the TOOL OUTPUT shape. Differs from the storage schema:
 * the model returns source_theme_refs (interview_id + theme_name); the
 * server resolves these into source_quote_refs (interview_id + quote_index)
 * by looking up the first quote of each matched per-interview theme.
 */
const toolOutputSchema = z.object({
  themes: z
    .array(
      z.object({
        // Aggregate names go up to 80 chars; see studyThemesSchema rationale.
        name: z.string().min(2).max(80),
        description: z.string().min(10).max(280),
        frequency: z.number().int().positive(),
        source_theme_refs: z
          .array(
            z.object({
              interview_id: z.string(),
              // theme_name references a per-interview theme, which is capped at 60.
              theme_name: z.string().min(2).max(60),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

function isToolUseBlock(block: unknown): block is ToolUseBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as { type?: unknown }).type === 'tool_use'
  );
}

export async function synthesizeStudy(
  input: SynthesizeStudyInput,
): Promise<SynthesizeStudyResult> {
  if (input.interviews.length < MIN_INTERVIEWS) {
    throw new Error(
      `synthesizeStudy requires at least ${MIN_INTERVIEWS} interviews, got ${input.interviews.length}`,
    );
  }

  // 1. Build prompt input (drops quotes; cost optimization).
  const promptInput: SynthesizeInterview[] = input.interviews.map((iv) => ({
    interview_id: iv.interview_id,
    themes: iv.themes,
    sentiment: iv.sentiment,
    summary: iv.summary,
  }));
  const userMessage = buildSynthesizeUserMessage(promptInput);

  // 2. Call the model with the synthesis tool forced.
  const anthropic = getAnthropic();
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      system: SYNTHESIZE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      tools: [recordStudySynthesisTool as unknown as Anthropic.Messages.Tool],
      tool_choice: { type: 'tool', name: recordStudySynthesisTool.name },
    }),
  );

  // 3. Locate the tool_use block.
  const blocks = Array.isArray(response?.content) ? response.content : [];
  const toolUse = blocks.find(
    (b) => isToolUseBlock(b) && b.name === recordStudySynthesisTool.name,
  ) as ToolUseBlock | undefined;
  if (!toolUse) {
    logger.warn(
      {
        blockTypes: (blocks as unknown[]).map((b) =>
          typeof b === 'object' && b !== null ? ((b as { type?: string }).type ?? 'unknown') : 'unknown',
        ),
        toolNames: (blocks as unknown[])
          .filter((b) => typeof b === 'object' && b !== null && (b as { type?: string }).type === 'tool_use')
          .map((b) => (b as { name?: string }).name ?? 'unnamed'),
      },
      'synthesize-study: response had no record_study_synthesis tool_use block',
    );
    throw new InvalidAnalysisFormatError();
  }

  // 4. Validate the tool output shape.
  const parsed = toolOutputSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    logger.warn(
      {
        issues: parsed.error.issues,
        modelInput: toolUse.input,
      },
      'synthesize-study: tool input failed Zod validation',
    );
    throw new InvalidAnalysisFormatError();
  }

  // 5. Strip em/en dashes from generated text. theme_name refs also get
  // stripped so they still match the (already-stripped) per-interview
  // theme names in the lookup below.
  const normalized = parsed.data.themes.map((t) => ({
    name: stripEmDashes(t.name),
    description: stripEmDashes(t.description),
    frequency: t.frequency,
    source_theme_refs: t.source_theme_refs.map((r) => ({
      interview_id: r.interview_id,
      theme_name: stripEmDashes(r.theme_name),
    })),
  }));

  // 6. Build per-interview lookup: theme name -> first quote index.
  // Re-strip defensively in case upstream stored data ever drifts.
  const themeQuoteLookup = new Map<string, Map<string, number>>();
  for (const iv of input.interviews) {
    const inner = new Map<string, number>();
    for (const theme of iv.themes) {
      const normName = stripEmDashes(theme.name);
      const firstQuoteIdx = iv.quotes.findIndex((q) => stripEmDashes(q.theme) === normName);
      if (firstQuoteIdx >= 0) {
        inner.set(normName, firstQuoteIdx);
      }
    }
    themeQuoteLookup.set(iv.interview_id, inner);
  }

  // 7. Resolve source_theme_refs into source_quote_refs. Drop unresolved
  // refs; prune aggregate themes that lose all refs. Server-recompute
  // frequency as count of distinct interview_ids in the surviving refs.
  let droppedThemes = 0;
  const survivingThemes: StudyThemes['themes'] = [];
  for (const theme of normalized) {
    const resolved: Array<{ interview_id: string; quote_index: number }> = [];
    for (const ref of theme.source_theme_refs) {
      const interviewMap = themeQuoteLookup.get(ref.interview_id);
      if (!interviewMap) continue;
      const quoteIdx = interviewMap.get(ref.theme_name);
      if (quoteIdx === undefined) continue;
      resolved.push({ interview_id: ref.interview_id, quote_index: quoteIdx });
    }
    if (resolved.length === 0) {
      droppedThemes++;
      continue;
    }
    const distinctInterviews = new Set(resolved.map((r) => r.interview_id)).size;
    survivingThemes.push({
      name: theme.name,
      description: theme.description,
      frequency: distinctInterviews,
      source_quote_refs: resolved,
    });
  }

  if (survivingThemes.length === 0) {
    throw new NoGroundedThemesError();
  }

  // 8. Final shape validation against the storage schema.
  const final = studyThemesSchema.parse({ themes: survivingThemes });

  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  return {
    themes: final.themes,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    droppedThemes,
  };
}
