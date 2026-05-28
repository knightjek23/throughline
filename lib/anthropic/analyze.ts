/**
 * Per-interview analysis service.
 *
 * Pipeline (per Day 3 spec):
 *   1. Token gate — throw TooLongError on >40k token transcripts.
 *   2. Build the user message with research question + participant label.
 *   3. Call Anthropic with the record_interview_analysis tool and tool_choice
 *      forcing the model to call it. Wrapped in withRetry() so a single 5xx
 *      or network blip self-heals.
 *   4. Extract the tool_use input block. If missing or malformed, throw
 *      InvalidAnalysisFormatError.
 *   5. Zod-parse against interviewAnalysisSchema. Same error class on failure.
 *   6. validateAndPrune: drop hallucinated quotes, prune orphan themes,
 *      throw NoGroundedThemesError if nothing survives.
 *   7. Return the cleaned analysis + token usage + drop counts.
 *
 * Each error class maps 1:1 to a user-facing failure_reason written by
 * the job handler — see app/api/jobs/analyze-interview/route.ts.
 */

import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { interviewAnalysisSchema, type InterviewAnalysis } from './schemas';
import { getAnthropic, MODEL, withRetry } from './client';
import { recordInterviewAnalysisTool } from './tool-definition';
import { ANALYZE_SYSTEM_PROMPT, buildUserMessage } from './prompts';
import { assertWithinLimit } from './tokens';
import { validateAndPrune } from './validate-quotes';
import { InvalidAnalysisFormatError } from './errors';

export interface AnalyzeInput {
  interviewId: string;
  transcript: string;
  researchQuestion: string | null;
  participantLabel: string | null;
}

export interface AnalyzeResult {
  analysis: InterviewAnalysis;
  inputTokens: number;
  outputTokens: number;
  droppedQuotes: number;
  droppedThemes: number;
}

const MAX_OUTPUT_TOKENS = 4096;
const TEMPERATURE = 0;

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

export async function analyzeInterview(input: AnalyzeInput): Promise<AnalyzeResult> {
  // 1. Fail loud before burning a single token on an oversize transcript.
  assertWithinLimit(input.transcript);

  // 2. Compose the user message.
  const userMessage = buildUserMessage({
    transcript: input.transcript,
    researchQuestion: input.researchQuestion,
    participantLabel: input.participantLabel,
  });

  // 3. Call the model, forcing it through the tool. withRetry handles
  // transient 5xx / network failures; non-retryable errors propagate.
  const anthropic = getAnthropic();
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      system: ANALYZE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      // The SDK's Tool type is structural; our literal-typed tool object
      // matches the runtime shape Anthropic expects.
      tools: [recordInterviewAnalysisTool as unknown as Anthropic.Messages.Tool],
      tool_choice: { type: 'tool', name: recordInterviewAnalysisTool.name },
    }),
  );

  // 4. Locate the tool_use block. If the model returned only text (or
  // skipped the tool entirely), surface the format error.
  const blocks = Array.isArray(response?.content) ? response.content : [];
  const toolUse = blocks.find(
    (b) => isToolUseBlock(b) && b.name === recordInterviewAnalysisTool.name,
  ) as ToolUseBlock | undefined;
  if (!toolUse) {
    throw new InvalidAnalysisFormatError();
  }

  // 5. Zod-validate the tool input against our schema.
  const parsed = interviewAnalysisSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new InvalidAnalysisFormatError();
  }

  // 6. Substring-validate + prune. Throws NoGroundedThemesError when zero
  // themes survive (i.e. fully hallucinated response).
  const { cleaned, droppedQuotes, droppedThemes } = validateAndPrune(
    parsed.data,
    input.transcript,
  );

  // 7. Done. Token counts come from the SDK response.
  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  return {
    analysis: cleaned,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    droppedQuotes,
    droppedThemes,
  };
}
