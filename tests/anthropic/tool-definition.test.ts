/**
 * Day 3 Task 3 tests: the `record_interview_analysis` tool definition.
 *
 * The tool is what we pass to Anthropic's `tools` parameter to force
 * structured output. Its `input_schema` mirrors `interviewAnalysisSchema`
 * (the Zod source-of-truth) closely enough that any object Anthropic
 * returns under this tool will round-trip through the Zod parser cleanly.
 *
 * Tests below cover:
 *  - Anthropic tool envelope shape (name, description, input_schema)
 *  - All four top-level fields present and required
 *  - Critical-path constraints from roadmap §4 (themes max 7, sentiment enum)
 *  - A hand-rolled valid example passes the Zod schema (sanity check)
 */

import { describe, it, expect } from 'vitest';
import { recordInterviewAnalysisTool } from '@/lib/anthropic/tool-definition';
import { interviewAnalysisSchema } from '@/lib/anthropic/schemas';

describe('recordInterviewAnalysisTool envelope', () => {
  it('uses the spec-mandated tool name', () => {
    expect(recordInterviewAnalysisTool.name).toBe('record_interview_analysis');
  });

  it('has a non-empty description', () => {
    expect(recordInterviewAnalysisTool.description).toBeTruthy();
    expect(recordInterviewAnalysisTool.description.length).toBeGreaterThan(20);
  });

  it('has an object-typed input_schema with the four top-level fields required', () => {
    const schema = recordInterviewAnalysisTool.input_schema;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(
      expect.arrayContaining(['summary', 'sentiment', 'themes', 'quotes']),
    );
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['summary', 'sentiment', 'themes', 'quotes']),
    );
  });
});

describe('recordInterviewAnalysisTool critical constraints', () => {
  it('caps themes at 7 (roadmap §4)', () => {
    const themes = recordInterviewAnalysisTool.input_schema.properties.themes;
    expect(themes.type).toBe('array');
    expect(themes.maxItems).toBe(7);
    expect(themes.minItems).toBe(1);
  });

  it('caps quotes at 20', () => {
    const quotes = recordInterviewAnalysisTool.input_schema.properties.quotes;
    expect(quotes.type).toBe('array');
    expect(quotes.maxItems).toBe(20);
    expect(quotes.minItems).toBe(1);
  });

  it('restricts sentiment to the four allowed values', () => {
    const sentiment = recordInterviewAnalysisTool.input_schema.properties.sentiment;
    expect(sentiment.enum).toEqual(['positive', 'mixed', 'negative', 'neutral']);
  });

  it('requires quote char positions (substring validator depends on these)', () => {
    const quotes = recordInterviewAnalysisTool.input_schema.properties.quotes;
    expect(quotes.items.required).toEqual(
      expect.arrayContaining(['text', 'theme', 'char_start', 'char_end']),
    );
  });

  it('requires theme name and description', () => {
    const themes = recordInterviewAnalysisTool.input_schema.properties.themes;
    expect(themes.items.required).toEqual(expect.arrayContaining(['name', 'description']));
  });
});

describe('Tool schema and Zod schema agree on a valid example', () => {
  it('a hand-rolled valid analysis object passes the Zod schema', () => {
    const example = {
      summary:
        'Participant described a research workflow built around scattered notes, with frustration around losing context between interviews and reluctance to learn another heavyweight tool.',
      sentiment: 'mixed',
      themes: [
        {
          name: 'Context loss between interviews',
          description:
            'Notes from one session rarely connect to the next, so insights get rediscovered or lost entirely.',
        },
        {
          name: 'Tool fatigue',
          description:
            'Strong reluctance to adopt another platform after multiple failed attempts with Dovetail and Notion.',
        },
      ],
      quotes: [
        {
          text: 'I literally just keep things in a Google Doc per study',
          theme: 'Context loss between interviews',
          char_start: 0,
          char_end: 49,
        },
        {
          text: 'I am not learning another tool',
          theme: 'Tool fatigue',
          char_start: 100,
          char_end: 130,
        },
      ],
    };

    expect(() => interviewAnalysisSchema.parse(example)).not.toThrow();
  });
});
