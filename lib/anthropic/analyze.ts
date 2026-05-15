/**
 * Per-interview analysis service.
 *
 * Day 2 STATUS: stub. Returns hardcoded analysis so the upload → queue →
 * status pipeline works end-to-end without burning Anthropic tokens. The
 * quotes are anchored to real transcript substrings so Day 3's substring
 * validator passes on stub output.
 *
 * Day 3 REPLACES this with the real Anthropic call. Critical constraints
 * (roadmap §4) still apply when that lands:
 *   - Quote text MUST be exact substring of transcript. Drop quotes that fail.
 *   - Themes capped at 7 per interview.
 *   - Transcripts >40k tokens chunked sequentially with theme merging.
 *   - Retry once on Anthropic failure; mark status='failed' on second fail.
 */

import 'server-only';
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

const STUB_THEMES = [
  {
    name: 'Onboarding friction',
    description:
      'Participants found initial setup confusing and slow, particularly around connecting accounts and configuring early preferences.',
  },
  {
    name: 'Manual workarounds',
    description:
      'Users built spreadsheets and external docs to fill gaps the product did not handle, indicating high-friction core flows.',
  },
  {
    name: 'Cost sensitivity',
    description:
      'Pricing came up unprompted as a barrier to adoption or expansion, especially at the individual-contributor tier.',
  },
];

const STUB_SUMMARY =
  'Participant discussed their current research workflow and pain points around the tools they use today. ' +
  'Themes around onboarding friction, manual workarounds for unsupported flows, and cost concerns at the individual-contributor tier came up unprompted.';

/**
 * Builds stub quotes anchored to actual substrings of the transcript so the
 * char_start / char_end / text contract holds. Day 3's substring validator
 * would accept these on stub data alone.
 */
function buildStubQuotes(transcript: string): InterviewAnalysis['quotes'] {
  const len = transcript.length;
  if (len < 50) {
    // Defensive: parser already requires ≥50 words, but if a tiny string
    // sneaks through, return one minimal quote spanning the whole thing.
    return [
      {
        text: transcript,
        theme: STUB_THEMES[0].name,
        char_start: 0,
        char_end: len,
      },
    ];
  }

  // Three quotes at roughly 20%, 45%, 70% of the transcript, ~100 chars each
  // (clamped so we never run off the end).
  const positions = [0.2, 0.45, 0.7];
  const segLen = Math.min(100, Math.floor(len / 4));

  return positions.map((pct, i) => {
    const start = Math.min(Math.floor(len * pct), len - segLen);
    const end = Math.min(start + segLen, len);
    return {
      text: transcript.slice(start, end),
      theme: STUB_THEMES[i % STUB_THEMES.length].name,
      char_start: start,
      char_end: end,
    };
  });
}

export async function analyzeInterview(input: AnalyzeInput): Promise<AnalyzeResult> {
  // Validate via the schema before returning so any mistake in the stub
  // surfaces here instead of at the DB-insert site.
  const analysis = interviewAnalysisSchema.parse({
    summary: STUB_SUMMARY,
    sentiment: 'mixed',
    themes: STUB_THEMES,
    quotes: buildStubQuotes(input.transcript),
  });

  return {
    analysis,
    inputTokens: 0,
    outputTokens: 0,
    droppedQuotes: 0,
  };
}
