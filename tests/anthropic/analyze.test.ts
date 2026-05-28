/**
 * Day 3 Task 6 tests: analyzeInterview composes the full pipeline.
 *
 * Mocks @anthropic-ai/sdk via vi.hoisted so we can drive happy paths,
 * retries, format errors, and validation failures from the test side.
 * Covers each error class the job handler will map to a failure_reason
 * in Task 7.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TooLongError,
  ApiRetryExhaustedError,
  InvalidAnalysisFormatError,
  NoGroundedThemesError,
} from '@/lib/anthropic/errors';

const messagesCreate = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => ({
  // SDK is invoked as `new Anthropic(...)`. Arrow functions aren't
  // constructable, so we expose a class whose instance carries the mocked
  // messages.create that tests drive via `messagesCreate`.
  default: class MockAnthropic {
    messages = { create: messagesCreate };
  },
}));

// Import AFTER the mock is set up.
import { analyzeInterview } from '@/lib/anthropic/analyze';

function httpError(status: number): Error {
  const err = new Error(`HTTP ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

function toolResponse(input: unknown, usage = { input_tokens: 100, output_tokens: 50 }) {
  return {
    id: 'msg_test',
    role: 'assistant',
    content: [
      { type: 'tool_use', id: 'toolu_test', name: 'record_interview_analysis', input },
    ],
    usage,
    stop_reason: 'tool_use',
    model: 'claude-sonnet-4-6',
  };
}

describe('analyzeInterview', () => {
  beforeEach(() => {
    messagesCreate.mockReset();
  });

  it('returns a valid analysis on the happy path', async () => {
    const transcript =
      'I built a spreadsheet to track everything. Honestly, every tool feels the same after a while.';
    messagesCreate.mockResolvedValue(
      toolResponse({
        summary:
          'Participant described maintaining a side spreadsheet and tool-evaluation fatigue across multiple platforms.',
        sentiment: 'mixed',
        themes: [
          {
            name: 'Manual workarounds',
            description: 'Maintains a side spreadsheet to fill in gaps the product does not cover.',
          },
          {
            name: 'Tool fatigue',
            description: 'Tired of evaluating yet another platform every few months.',
          },
        ],
        quotes: [
          {
            text: 'I built a spreadsheet to track everything',
            theme: 'Manual workarounds',
            char_start: 0,
            char_end: 41,
          },
          {
            text: 'every tool feels the same after a while',
            theme: 'Tool fatigue',
            char_start: 53,
            char_end: 92,
          },
        ],
      }),
    );

    const result = await analyzeInterview({
      interviewId: 'iv_1',
      transcript,
      researchQuestion: 'What blocks researchers from finishing synthesis?',
      participantLabel: 'P1',
    });

    expect(result.analysis.themes).toHaveLength(2);
    expect(result.analysis.quotes).toHaveLength(2);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.droppedQuotes).toBe(0);
    expect(result.droppedThemes).toBe(0);
  });

  it('throws TooLongError before calling the API when transcript exceeds 40k tokens', async () => {
    const huge = Array.from({ length: 31_000 }, (_, i) => `w${i}`).join(' ');
    await expect(
      analyzeInterview({
        interviewId: 'iv_2',
        transcript: huge,
        researchQuestion: null,
        participantLabel: null,
      }),
    ).rejects.toBeInstanceOf(TooLongError);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('retries once on 5xx then throws ApiRetryExhaustedError', async () => {
    messagesCreate.mockRejectedValue(httpError(500));
    await expect(
      analyzeInterview({
        interviewId: 'iv_3',
        transcript: 'some transcript content that is long enough',
        researchQuestion: null,
        participantLabel: null,
      }),
    ).rejects.toBeInstanceOf(ApiRetryExhaustedError);
    expect(messagesCreate).toHaveBeenCalledTimes(2);
  });

  it('throws InvalidAnalysisFormatError when response has no tool_use block', async () => {
    messagesCreate.mockResolvedValue({
      id: 'msg_test',
      role: 'assistant',
      content: [{ type: 'text', text: 'I cannot help with that.' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: 'end_turn',
      model: 'claude-sonnet-4-6',
    });
    await expect(
      analyzeInterview({
        interviewId: 'iv_4',
        transcript: 'some transcript content',
        researchQuestion: null,
        participantLabel: null,
      }),
    ).rejects.toBeInstanceOf(InvalidAnalysisFormatError);
  });

  it('throws InvalidAnalysisFormatError when tool input fails the Zod schema', async () => {
    messagesCreate.mockResolvedValue(
      toolResponse({
        summary: 'too short', // <20 chars, violates schema min
        sentiment: 'mixed',
        themes: [],
        quotes: [],
      }),
    );
    await expect(
      analyzeInterview({
        interviewId: 'iv_5',
        transcript: 'some transcript content',
        researchQuestion: null,
        participantLabel: null,
      }),
    ).rejects.toBeInstanceOf(InvalidAnalysisFormatError);
  });

  it('throws NoGroundedThemesError when every quote is hallucinated', async () => {
    const transcript = 'real transcript content that exists here';
    messagesCreate.mockResolvedValue(
      toolResponse({
        summary:
          'Participant talked at length about a fully fabricated topic that is not in the transcript anywhere.',
        sentiment: 'mixed',
        themes: [
          {
            name: 'Fake A',
            description: 'A fabricated theme description meeting length minimum.',
          },
          {
            name: 'Fake B',
            description: 'Another fabricated theme description meeting length minimum.',
          },
        ],
        quotes: [
          { text: 'totally fabricated quote one here', theme: 'Fake A', char_start: 0, char_end: 33 },
          { text: 'another fabricated quote two here', theme: 'Fake B', char_start: 0, char_end: 33 },
        ],
      }),
    );
    await expect(
      analyzeInterview({
        interviewId: 'iv_6',
        transcript,
        researchQuestion: null,
        participantLabel: null,
      }),
    ).rejects.toBeInstanceOf(NoGroundedThemesError);
  });

  it('returns cleaned analysis with drop counts when only some quotes hallucinate', async () => {
    const transcript = 'this is real content that exists in the transcript verbatim';
    messagesCreate.mockResolvedValue(
      toolResponse({
        summary:
          'Participant discussed something concrete and something fabricated, with mixed signal across the conversation.',
        sentiment: 'mixed',
        themes: [
          {
            name: 'Real theme',
            description: 'This theme has a real quote backing it and survives validation.',
          },
          {
            name: 'Fake theme',
            description: 'This theme will lose its only quote and get pruned.',
          },
        ],
        quotes: [
          { text: 'this is real content', theme: 'Real theme', char_start: 0, char_end: 20 },
          {
            text: 'totally fabricated quote here',
            theme: 'Fake theme',
            char_start: 0,
            char_end: 29,
          },
        ],
      }),
    );

    const result = await analyzeInterview({
      interviewId: 'iv_7',
      transcript,
      researchQuestion: null,
      participantLabel: null,
    });

    expect(result.droppedQuotes).toBe(1);
    expect(result.droppedThemes).toBe(1);
    expect(result.analysis.themes).toHaveLength(1);
    expect(result.analysis.themes[0].name).toBe('Real theme');
    expect(result.analysis.quotes).toHaveLength(1);
  });
});
