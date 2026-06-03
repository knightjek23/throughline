/**
 * Day 3 Task 4 tests: system prompt content + user message builder.
 *
 * The system prompt is a stable constant (cached by Anthropic on stable
 * input). Per-interview variability (research question, participant label,
 * transcript) goes into the user message. These tests assert the contract
 * surface rather than the prose — exact wording can drift during dogfood
 * prompt tuning without these tests becoming brittle.
 */

import { describe, it, expect } from 'vitest';
import {
  ANALYZE_SYSTEM_PROMPT,
  buildUserMessage,
  SYNTHESIZE_SYSTEM_PROMPT,
  buildSynthesizeUserMessage,
  type SynthesizeInterview,
} from '@/lib/anthropic/prompts';

describe('ANALYZE_SYSTEM_PROMPT', () => {
  it('is a non-trivial prompt', () => {
    expect(ANALYZE_SYSTEM_PROMPT.length).toBeGreaterThan(200);
  });

  it('references the tool by name', () => {
    expect(ANALYZE_SYSTEM_PROMPT).toContain('record_interview_analysis');
  });

  it('enforces verbatim quote substrings', () => {
    expect(ANALYZE_SYSTEM_PROMPT.toLowerCase()).toMatch(/verbatim|substring/);
  });

  it('mentions the 7-theme cap', () => {
    expect(ANALYZE_SYSTEM_PROMPT).toMatch(/\b7\b|seven/i);
  });

  it('allows 1-2 surprising off-research-question themes', () => {
    expect(ANALYZE_SYSTEM_PROMPT.toLowerCase()).toMatch(/surpris|off-research|unexpected/);
  });

  it('does not contain placeholder text', () => {
    expect(ANALYZE_SYSTEM_PROMPT).not.toContain('drop in v0 prompt');
    expect(ANALYZE_SYSTEM_PROMPT).not.toContain('TODO');
  });

  it('forbids em dashes in generated content', () => {
    expect(ANALYZE_SYSTEM_PROMPT.toLowerCase()).toMatch(/em dash|em-dash/);
  });

  it('exempts verbatim quotes from the em-dash rule', () => {
    // The prompt must call out that quotes are excluded, otherwise the model
    // might mangle a transcript that legitimately contains em dashes.
    expect(ANALYZE_SYSTEM_PROMPT.toLowerCase()).toMatch(
      /quote.*verbatim|verbatim.*quote|exact substring/,
    );
  });

  it('does not itself contain em or en dashes', () => {
    expect(ANALYZE_SYSTEM_PROMPT).not.toMatch(/[—–]/);
  });
});

describe('buildUserMessage()', () => {
  const TRANSCRIPT = 'Interviewer: How are you finding the tool? Participant: Honestly it is fine.';

  it('always includes the transcript verbatim', () => {
    const msg = buildUserMessage({
      transcript: TRANSCRIPT,
      researchQuestion: null,
      participantLabel: null,
    });
    expect(msg).toContain(TRANSCRIPT);
  });

  it('labels the transcript section so the model knows where it starts', () => {
    const msg = buildUserMessage({
      transcript: TRANSCRIPT,
      researchQuestion: null,
      participantLabel: null,
    });
    expect(msg.toLowerCase()).toContain('transcript');
  });

  it('includes the research question when provided', () => {
    const rq = 'What is blocking solo researchers from finishing synthesis?';
    const msg = buildUserMessage({
      transcript: TRANSCRIPT,
      researchQuestion: rq,
      participantLabel: null,
    });
    expect(msg).toContain(rq);
    expect(msg.toLowerCase()).toContain('research question');
  });

  it('omits the research question section when null', () => {
    const msg = buildUserMessage({
      transcript: TRANSCRIPT,
      researchQuestion: null,
      participantLabel: null,
    });
    expect(msg.toLowerCase()).not.toContain('research question');
  });

  it('includes the participant label when provided', () => {
    const msg = buildUserMessage({
      transcript: TRANSCRIPT,
      researchQuestion: null,
      participantLabel: 'P3 (PM at fintech startup)',
    });
    expect(msg).toContain('P3 (PM at fintech startup)');
  });

  it('omits the participant section when label is null', () => {
    const msg = buildUserMessage({
      transcript: TRANSCRIPT,
      researchQuestion: null,
      participantLabel: null,
    });
    // The literal word "Participant:" appears in the transcript itself, so we
    // look for our own section header pattern instead.
    expect(msg).not.toMatch(/^Participant:/m);
  });

  it('puts the transcript last so context (RQ, participant) is read first', () => {
    const msg = buildUserMessage({
      transcript: TRANSCRIPT,
      researchQuestion: 'Why do people churn?',
      participantLabel: 'P1',
    });
    const rqIdx = msg.indexOf('Why do people churn?');
    const labelIdx = msg.indexOf('P1');
    const transcriptIdx = msg.indexOf(TRANSCRIPT);
    expect(rqIdx).toBeGreaterThanOrEqual(0);
    expect(labelIdx).toBeGreaterThanOrEqual(0);
    expect(transcriptIdx).toBeGreaterThan(rqIdx);
    expect(transcriptIdx).toBeGreaterThan(labelIdx);
  });
});

describe('SYNTHESIZE_SYSTEM_PROMPT', () => {
  it('is a non-trivial prompt', () => {
    expect(SYNTHESIZE_SYSTEM_PROMPT.length).toBeGreaterThan(200);
  });

  it('references the synthesize tool by name', () => {
    expect(SYNTHESIZE_SYSTEM_PROMPT).toContain('record_study_synthesis');
  });

  it('mentions deduplication across interviews', () => {
    expect(SYNTHESIZE_SYSTEM_PROMPT.toLowerCase()).toMatch(/dedup|merge|collaps|same thing/);
  });

  it('mentions frequency', () => {
    expect(SYNTHESIZE_SYSTEM_PROMPT.toLowerCase()).toContain('frequency');
  });

  it('mentions source_theme_refs back to per-interview themes', () => {
    expect(SYNTHESIZE_SYSTEM_PROMPT).toMatch(/source_theme_refs|reference.*back|point.*back/i);
  });

  it('forbids em dashes in generated content', () => {
    expect(SYNTHESIZE_SYSTEM_PROMPT.toLowerCase()).toMatch(/em dash|em-dash/);
  });

  it('does not itself contain em or en dashes', () => {
    expect(SYNTHESIZE_SYSTEM_PROMPT).not.toMatch(/[—–]/);
  });

  it('does not contain placeholder text', () => {
    expect(SYNTHESIZE_SYSTEM_PROMPT).not.toContain('drop in v0 prompt');
    expect(SYNTHESIZE_SYSTEM_PROMPT).not.toContain('TODO');
  });
});

describe('buildSynthesizeUserMessage', () => {
  const I1: SynthesizeInterview = {
    interview_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    themes: [
      { name: 'Synthesis bottleneck', description: 'Post-interview write-up was the chokepoint.' },
      { name: 'Tool fatigue', description: 'Tired of evaluating another platform every quarter.' },
    ],
    sentiment: 'mixed',
    summary: 'Solo researcher described synthesis as the limiting factor in weekly throughput.',
  };
  const I2: SynthesizeInterview = {
    interview_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    themes: [
      { name: 'Synthesis is hard', description: 'Cannot keep findings straight across interviews.' },
    ],
    sentiment: 'negative',
    summary: 'Researcher at a different company described similar pain around cross-interview themes.',
  };

  it('includes every interview_id', () => {
    const msg = buildSynthesizeUserMessage([I1, I2]);
    expect(msg).toContain(I1.interview_id);
    expect(msg).toContain(I2.interview_id);
  });

  it('includes every theme name and description', () => {
    const msg = buildSynthesizeUserMessage([I1, I2]);
    expect(msg).toContain('Synthesis bottleneck');
    expect(msg).toContain('Post-interview write-up was the chokepoint.');
    expect(msg).toContain('Tool fatigue');
    expect(msg).toContain('Synthesis is hard');
  });

  it('includes sentiment and summary for each interview', () => {
    const msg = buildSynthesizeUserMessage([I1, I2]);
    expect(msg).toContain('mixed');
    expect(msg).toContain('negative');
    expect(msg).toContain(I1.summary);
    expect(msg).toContain(I2.summary);
  });

  it('is deterministic regardless of input order', () => {
    const msg1 = buildSynthesizeUserMessage([I1, I2]);
    const msg2 = buildSynthesizeUserMessage([I2, I1]);
    expect(msg1).toBe(msg2);
  });

  it('does not invent quote text from the input themes', () => {
    // SynthesizeInterview has no quotes field on purpose. The builder must
    // not synthesize fake quotes from descriptions or summaries.
    const msg = buildSynthesizeUserMessage([I1, I2]);
    expect(msg.toLowerCase()).not.toContain('quote:');
  });
});
