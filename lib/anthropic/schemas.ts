/**
 * Zod schemas for Anthropic-produced JSON. Used to validate every model
 * response before persisting. Day 3 fills in `interviewAnalysisSchema` content
 * and quote substring validation.
 */

import { z } from 'zod';

// Per-interview output. Themes capped at 7 (roadmap §4 critical constraint).
export const interviewAnalysisSchema = z.object({
  summary: z.string().min(20).max(800),
  sentiment: z.enum(['positive', 'mixed', 'negative', 'neutral']),
  themes: z
    .array(
      z.object({
        name: z.string().min(2).max(60),
        description: z.string().min(10).max(280),
      }),
    )
    .min(1)
    .max(7),
  quotes: z
    .array(
      z.object({
        text: z.string().min(10).max(600),
        theme: z.string().min(2).max(60),
        // Char positions in original transcript — required for substring validation.
        char_start: z.number().int().nonnegative(),
        char_end: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(20),
});
export type InterviewAnalysis = z.infer<typeof interviewAnalysisSchema>;

// Aggregate output. Studied themes are deduplicated across interviews.
export const studyThemesSchema = z.object({
  themes: z
    .array(
      z.object({
        name: z.string().min(2).max(60),
        description: z.string().min(10).max(280),
        frequency: z.number().int().positive(),
        source_quote_refs: z
          .array(
            z.object({
              interview_id: z.string().uuid(),
              quote_index: z.number().int().nonnegative(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});
export type StudyThemes = z.infer<typeof studyThemesSchema>;
