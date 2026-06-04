/**
 * Day 4 Task 4 tests: synthesizeStudy composes the full aggregate pipeline.
 *
 * Mocks @anthropic-ai/sdk via vi.hoisted so we can drive happy paths,
 * retries, format errors, and source-ref resolution from the test side.
 *
 * The service is pure: input is the per-interview analyses, output is
 * the storage-shape themes (studyThemesSchema) + token counts + drop count.
 * The caller (job handler) does the DB fetch and the DB upsert.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ApiRetryExhaustedError,
  InvalidAnalysisFormatError,
  NoGroundedThemesError,
} from '@/lib/anthropic/errors';

const messagesCreate = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: messagesCreate };
  },
}));

// Import AFTER the mock is set up.
import { synthesizeStudy, type SynthesizeStudyInterview } from '@/lib/anthropic/synthesize';

function httpError(status: number): Error {
  const err = new Error(`HTTP ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

function toolResponse(input: unknown, usage = { input_tokens: 200, output_tokens: 100 }) {
  return {
    id: 'msg_test',
    role: 'assistant',
    content: [
      { type: 'tool_use', id: 'toolu_test', name: 'record_study_synthesis', input },
    ],
    usage,
    stop_reason: 'tool_use',
    model: 'claude-sonnet-4-6',
  };
}

const I1: SynthesizeStudyInterview = {
  interview_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  themes: [{ name: 'Synthesis bottleneck', description: 'Synthesis is the chokepoint.' }],
  sentiment: 'mixed',
  summary: 'Solo researcher described synthesis as the limiting factor.',
  quotes: [
    {
      text: 'synthesis is the slow part',
      theme: 'Synthesis bottleneck',
      char_start: 0,
      char_end: 26,
    },
  ],
};

const I2: SynthesizeStudyInterview = {
  interview_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  themes: [{ name: 'Synthesis is hard', description: 'Cannot keep findings straight.' }],
  sentiment: 'negative',
  summary: 'Researcher at a different company described similar pain.',
  quotes: [
    {
      text: 'cant keep findings straight',
      theme: 'Synthesis is hard',
      char_start: 0,
      char_end: 27,
    },
  ],
};

const I3: SynthesizeStudyInterview = {
  interview_id: 'cccccccc-cccc-4ccc-bccc-cccccccccccc',
  themes: [{ name: 'Slow write-up', description: 'Post-interview write-up drags into weekends.' }],
  sentiment: 'mixed',
  summary: 'A third researcher described same theme with different framing.',
  quotes: [
    {
      text: 'write-up drags into weekends',
      theme: 'Slow write-up',
      char_start: 0,
      char_end: 28,
    },
  ],
};

describe('synthesizeStudy', () => {
  beforeEach(() => {
    messagesCreate.mockReset();
  });

  it('returns a valid aggregate on the happy path (3 interviews merged into 1)', async () => {
    messagesCreate.mockResolvedValue(
      toolResponse({
        themes: [
          {
            name: 'Synthesis bottleneck',
            description:
              'Post-interview synthesis was the chokepoint that limited weekly research throughput.',
            frequency: 3,
            source_theme_refs: [
              { interview_id: I1.interview_id, theme_name: 'Synthesis bottleneck' },
              { interview_id: I2.interview_id, theme_name: 'Synthesis is hard' },
              { interview_id: I3.interview_id, theme_name: 'Slow write-up' },
            ],
          },
        ],
      }),
    );

    const result = await synthesizeStudy({ interviews: [I1, I2, I3] });

    expect(result.themes).toHaveLength(1);
    expect(result.themes[0].name).toBe('Synthesis bottleneck');
    expect(result.themes[0].frequency).toBe(3);
    expect(result.themes[0].source_quote_refs).toHaveLength(3);
    expect(result.droppedThemes).toBe(0);
    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(100);
  });

  it('throws when fewer than 3 interviews are provided', async () => {
    await expect(synthesizeStudy({ interviews: [I1, I2] })).rejects.toThrow();
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('retries once on 5xx then throws ApiRetryExhaustedError', async () => {
    messagesCreate.mockRejectedValue(httpError(500));
    await expect(synthesizeStudy({ interviews: [I1, I2, I3] })).rejects.toBeInstanceOf(
      ApiRetryExhaustedError,
    );
    expect(messagesCreate).toHaveBeenCalledTimes(2);
  });

  it('throws InvalidAnalysisFormatError when response has no tool_use block', async () => {
    messagesCreate.mockResolvedValue({
      id: 'msg_test',
      role: 'assistant',
      content: [{ type: 'text', text: 'I cannot help with that.' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: 'end_turn',
    });
    await expect(synthesizeStudy({ interviews: [I1, I2, I3] })).rejects.toBeInstanceOf(
      InvalidAnalysisFormatError,
    );
  });

  it('throws InvalidAnalysisFormatError when tool input fails schema validation', async () => {
    messagesCreate.mockResolvedValue(
      toolResponse({
        themes: [], // violates minItems: 1
      }),
    );
    await expect(synthesizeStudy({ interviews: [I1, I2, I3] })).rejects.toBeInstanceOf(
      InvalidAnalysisFormatError,
    );
  });

  it('strips em dashes from aggregate theme names and descriptions', async () => {
    messagesCreate.mockResolvedValue(
      toolResponse({
        themes: [
          {
            name: 'Synthesis — the real bottleneck',
            description: 'Theme description — with em dashes — embedded throughout the prose.',
            frequency: 1,
            source_theme_refs: [
              { interview_id: I1.interview_id, theme_name: 'Synthesis bottleneck' },
            ],
          },
        ],
      }),
    );
    const result = await synthesizeStudy({ interviews: [I1, I2, I3] });
    expect(result.themes[0].name).not.toMatch(/[—–]/);
    expect(result.themes[0].description).not.toMatch(/[—–]/);
  });

  it('resolves source_theme_refs to source_quote_refs using the first matching quote', async () => {
    messagesCreate.mockResolvedValue(
      toolResponse({
        themes: [
          {
            name: 'Synthesis bottleneck',
            description: 'Cross-interview theme description that meets length minimum.',
            frequency: 1,
            source_theme_refs: [
              { interview_id: I1.interview_id, theme_name: 'Synthesis bottleneck' },
            ],
          },
        ],
      }),
    );
    const result = await synthesizeStudy({ interviews: [I1, I2, I3] });
    expect(result.themes[0].source_quote_refs).toEqual([
      { interview_id: I1.interview_id, quote_index: 0 },
    ]);
  });

  it('prunes aggregate themes with zero resolvable source refs', async () => {
    messagesCreate.mockResolvedValue(
      toolResponse({
        themes: [
          {
            name: 'Synthesis bottleneck',
            description: 'Real theme that maps back to an actual per-interview theme.',
            frequency: 1,
            source_theme_refs: [
              { interview_id: I1.interview_id, theme_name: 'Synthesis bottleneck' },
            ],
          },
          {
            name: 'Phantom aggregate',
            description: 'This aggregate theme points to per-interview themes that do not exist.',
            frequency: 1,
            source_theme_refs: [
              { interview_id: I1.interview_id, theme_name: 'NonExistent Theme' },
            ],
          },
        ],
      }),
    );
    const result = await synthesizeStudy({ interviews: [I1, I2, I3] });
    expect(result.themes).toHaveLength(1);
    expect(result.themes[0].name).toBe('Synthesis bottleneck');
    expect(result.droppedThemes).toBe(1);
  });

  it('throws NoGroundedThemesError when every aggregate theme orphans', async () => {
    messagesCreate.mockResolvedValue(
      toolResponse({
        themes: [
          {
            name: 'Phantom one',
            description: 'Points to themes that do not exist anywhere.',
            frequency: 1,
            source_theme_refs: [
              { interview_id: I1.interview_id, theme_name: 'Phantom A' },
              { interview_id: I2.interview_id, theme_name: 'Phantom B' },
            ],
          },
        ],
      }),
    );
    await expect(synthesizeStudy({ interviews: [I1, I2, I3] })).rejects.toBeInstanceOf(
      NoGroundedThemesError,
    );
  });

  it('overrides model frequency with server-computed distinct interview count', async () => {
    // Model claims frequency=5 but only 2 refs resolve cleanly across 2 distinct interviews.
    messagesCreate.mockResolvedValue(
      toolResponse({
        themes: [
          {
            name: 'Synthesis bottleneck',
            description: 'Aggregate theme description meeting length minimum easily.',
            frequency: 5,
            source_theme_refs: [
              { interview_id: I1.interview_id, theme_name: 'Synthesis bottleneck' },
              { interview_id: I2.interview_id, theme_name: 'Synthesis is hard' },
            ],
          },
        ],
      }),
    );
    const result = await synthesizeStudy({ interviews: [I1, I2, I3] });
    expect(result.themes[0].frequency).toBe(2);
  });
});
