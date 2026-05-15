/**
 * Unit tests for the Day 2 stub `analyzeInterview`.
 *
 * The stub returns hardcoded fake analysis so the upload → queue → status
 * pipeline can be tested without burning Anthropic tokens. Tests lock in:
 *  - Return value validates against the Zod schema
 *  - Quote char positions point to real substrings of the transcript
 *    (so Day 3's substring validator would pass on stub output)
 *  - Themes capped at 7 per the roadmap constraint
 *  - At least one quote returned
 */

import { describe, it, expect } from 'vitest';
import { analyzeInterview } from '@/lib/anthropic/analyze';
import { interviewAnalysisSchema } from '@/lib/anthropic/schemas';

function syntheticTranscript(words = 200): string {
  return Array.from({ length: words }, (_, i) => `word${i}`).join(' ');
}

describe('analyzeInterview (Day 2 stub)', () => {
  it('returns a result that validates against the Zod schema', async () => {
    const transcript = syntheticTranscript(200);
    const result = await analyzeInterview({
      interviewId: 'interview_test_1',
      transcript,
      researchQuestion: 'What pain points do solo PMs feel in their research workflow?',
      participantLabel: 'P1',
    });

    // The parser inside the function already enforces this, but lock it down
    // explicitly so a future refactor can't accidentally regress.
    expect(() => interviewAnalysisSchema.parse(result.analysis)).not.toThrow();
  });

  it('returns themes that fit the 1-7 cap from roadmap §4', async () => {
    const result = await analyzeInterview({
      interviewId: 'interview_test_2',
      transcript: syntheticTranscript(200),
      researchQuestion: null,
      participantLabel: null,
    });
    expect(result.analysis.themes.length).toBeGreaterThanOrEqual(1);
    expect(result.analysis.themes.length).toBeLessThanOrEqual(7);
  });

  it('returns at least one quote', async () => {
    const result = await analyzeInterview({
      interviewId: 'interview_test_3',
      transcript: syntheticTranscript(200),
      researchQuestion: null,
      participantLabel: null,
    });
    expect(result.analysis.quotes.length).toBeGreaterThanOrEqual(1);
  });

  it('quote char positions point to actual transcript substrings', async () => {
    const transcript = syntheticTranscript(200);
    const result = await analyzeInterview({
      interviewId: 'interview_test_4',
      transcript,
      researchQuestion: null,
      participantLabel: null,
    });

    // This is the Day 3 quote-substring validator's job, but the stub should
    // already pass it so we exercise the pipeline end-to-end on fake data.
    for (const quote of result.analysis.quotes) {
      const slice = transcript.slice(quote.char_start, quote.char_end);
      expect(slice).toBe(quote.text);
    }
  });

  it('reports zero token usage (stub does not call the API)', async () => {
    const result = await analyzeInterview({
      interviewId: 'interview_test_5',
      transcript: syntheticTranscript(200),
      researchQuestion: null,
      participantLabel: null,
    });
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.droppedQuotes).toBe(0);
  });
});
