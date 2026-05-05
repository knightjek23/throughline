/**
 * Per-interview analysis service.
 * Day 3: fill in the system prompt + caching + retry. This stub sets the shape.
 *
 * Critical constraints (roadmap §4):
 *  - Quote text MUST be exact substring of transcript. Drop quotes that fail.
 *  - Themes capped at 7 per interview.
 *  - Transcripts >40k tokens are chunked sequentially with theme merging.
 *  - Retry once on Anthropic failure; mark interview status='failed' on second fail.
 */

import 'server-only';
import { getAnthropic, MODEL } from './client';
import { interviewAnalysisSchema, type InterviewAnalysis } from './schemas';

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
  droppedQuotes: number; // quotes that failed substring validation
}

export async function analyzeInterview(_input: AnalyzeInput): Promise<AnalyzeResult> {
  // TODO Day 3: implement
  // 1. Call Anthropic with cached system prompt + transcript (prompt caching: cache_control on system block)
  // 2. Parse JSON response, validate with interviewAnalysisSchema
  // 3. For each quote, verify transcript.slice(char_start, char_end) === text. Drop mismatches.
  // 4. Return validated result with token usage
  void getAnthropic; void MODEL; void interviewAnalysisSchema;
  throw new Error('analyzeInterview: not implemented (Day 3)');
}
