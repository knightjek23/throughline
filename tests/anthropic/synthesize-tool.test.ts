/**
 * Day 4 Task 2 tests: the `record_study_synthesis` tool definition.
 *
 * Important architectural note: the tool's input_schema does NOT match
 * studyThemesSchema exactly. The model returns aggregate themes with
 * `source_theme_refs: [{interview_id, theme_name}]` because the model
 * has access to interview_ids and theme names in the prompt but not to
 * quote indices. The server post-processes these refs into
 * `source_quote_refs: [{interview_id, quote_index}]` (the storage shape)
 * by looking up the first quote of each matched per-interview theme.
 *
 * Tests below cover the tool envelope, the dedup constraints
 * (frequency >= 1, refs minItems 1), and the field types the server
 * will rely on during post-processing.
 */

import { describe, it, expect } from 'vitest';
import { recordStudySynthesisTool } from '@/lib/anthropic/synthesize-tool';

describe('recordStudySynthesisTool envelope', () => {
  it('uses the spec-mandated tool name', () => {
    expect(recordStudySynthesisTool.name).toBe('record_study_synthesis');
  });

  it('has a non-empty description', () => {
    expect(recordStudySynthesisTool.description).toBeTruthy();
    expect(recordStudySynthesisTool.description.length).toBeGreaterThan(40);
  });

  it('has an object-typed input_schema with themes required', () => {
    const schema = recordStudySynthesisTool.input_schema;
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('themes');
    expect(Object.keys(schema.properties)).toContain('themes');
  });
});

describe('recordStudySynthesisTool theme constraints', () => {
  it('requires at least one theme', () => {
    const themes = recordStudySynthesisTool.input_schema.properties.themes;
    expect(themes.type).toBe('array');
    expect(themes.minItems).toBe(1);
  });

  it('requires name, description, frequency, and source_theme_refs on each theme', () => {
    const themeItem = recordStudySynthesisTool.input_schema.properties.themes.items;
    expect(themeItem.required).toEqual(
      expect.arrayContaining(['name', 'description', 'frequency', 'source_theme_refs']),
    );
  });

  it('declares frequency as a positive integer', () => {
    const freq =
      recordStudySynthesisTool.input_schema.properties.themes.items.properties.frequency;
    expect(freq.type).toBe('integer');
    expect(freq.minimum).toBeGreaterThanOrEqual(1);
  });

  it('declares source_theme_refs as an array with minItems 1', () => {
    const refs =
      recordStudySynthesisTool.input_schema.properties.themes.items.properties.source_theme_refs;
    expect(refs.type).toBe('array');
    expect(refs.minItems).toBe(1);
  });

  it('requires interview_id and theme_name on each ref', () => {
    const refItem =
      recordStudySynthesisTool.input_schema.properties.themes.items.properties.source_theme_refs
        .items;
    expect(refItem.required).toEqual(expect.arrayContaining(['interview_id', 'theme_name']));
  });
});

describe('recordStudySynthesisTool valid example', () => {
  it('a hand-rolled valid aggregate object has the right shape', () => {
    const example = {
      themes: [
        {
          name: 'Synthesis bottleneck',
          description:
            'Across interviews, post-interview synthesis was the chokepoint that limited weekly research throughput.',
          frequency: 3,
          source_theme_refs: [
            {
              interview_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              theme_name: 'Synthesis is the bottleneck',
            },
            {
              interview_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
              theme_name: 'Post-interview write-up takes forever',
            },
          ],
        },
      ],
    };

    expect(example.themes.length).toBeGreaterThan(0);
    for (const theme of example.themes) {
      expect(theme.frequency).toBeGreaterThanOrEqual(1);
      expect(theme.source_theme_refs.length).toBeGreaterThanOrEqual(1);
      for (const ref of theme.source_theme_refs) {
        expect(typeof ref.interview_id).toBe('string');
        expect(typeof ref.theme_name).toBe('string');
      }
    }
  });
});
