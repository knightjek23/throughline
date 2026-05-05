/**
 * Aggregate cross-interview synthesis service.
 * Day 4: fill in. Triggered after every upload past the 3rd analyzed interview.
 *
 * Inputs: all interview_analyses.themes_json for the study + research question.
 * Output: deduplicated study_themes with frequency + source_quote_refs.
 *
 * MUST preserve user-edited themes (user_edited=true) — never overwrite renames or merges.
 */

import 'server-only';
import { getAnthropic, MODEL } from './client';
import { studyThemesSchema, type StudyThemes } from './schemas';

export interface SynthesizeInput {
  studyId: string;
  researchQuestion: string | null;
  interviewThemes: Array<{
    interview_id: string;
    themes: Array<{ name: string; description: string }>;
    quotes: Array<{ text: string; theme: string }>;
  }>;
  // Existing user-edited themes are passed in so the model can preserve them.
  preserveThemes: Array<{ id: string; name: string; description: string | null }>;
}

export interface SynthesizeResult {
  themes: StudyThemes['themes'];
  inputTokens: number;
  outputTokens: number;
}

export async function synthesizeStudy(_input: SynthesizeInput): Promise<SynthesizeResult> {
  // TODO Day 4: implement
  void getAnthropic; void MODEL; void studyThemesSchema;
  throw new Error('synthesizeStudy: not implemented (Day 4)');
}
