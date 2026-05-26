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
import { ANALYZE_SYSTEM_PROMPT, buildUserMessage } from '@/lib/anthropic/prompts';

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
