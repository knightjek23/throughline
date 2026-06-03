/**
 * Anthropic tool definition for `record_study_synthesis`.
 *
 * Passed to `client.messages.create({ tools: [recordStudySynthesisTool] })`
 * with `tool_choice: { type: 'tool', name: 'record_study_synthesis' }`
 * to force structured output for the cross-study aggregate pass.
 *
 * IMPORTANT shape mismatch with storage: the tool returns
 * `source_theme_refs: [{interview_id, theme_name}]` because the model
 * only has interview_ids + theme names in the prompt (no quote indices).
 * The server post-processor in `lib/anthropic/synthesize.ts` resolves
 * these refs into `source_quote_refs: [{interview_id, quote_index}]`
 * (the studyThemesSchema storage shape) by looking up the first quote
 * of each matched per-interview theme.
 */

export const recordStudySynthesisTool = {
  name: 'record_study_synthesis',
  description:
    'Record the cross-study aggregate synthesis. Read every per-interview analysis, dedup themes that mean the same thing across interviews, and call this tool exactly once with the deduplicated aggregate themes. Every theme must include its frequency (count of interviews where it appeared) and source_theme_refs pointing back to the per-interview themes it merged.',
  input_schema: {
    type: 'object' as const,
    required: ['themes'],
    properties: {
      themes: {
        type: 'array' as const,
        description:
          'Deduplicated aggregate themes across all interviews. Themes that mean the same thing should collapse into one entry; do not list near-duplicates separately. Order from most to least frequent.',
        minItems: 1,
        items: {
          type: 'object' as const,
          required: ['name', 'description', 'frequency', 'source_theme_refs'],
          properties: {
            name: {
              type: 'string' as const,
              description:
                'Short, specific aggregate theme label. Avoid generic single words like "feedback" or "issues".',
              minLength: 2,
              maxLength: 60,
            },
            description: {
              type: 'string' as const,
              description:
                'One to two sentences explaining what the theme captures across interviews and why it surfaced.',
              minLength: 10,
              maxLength: 280,
            },
            frequency: {
              type: 'integer' as const,
              description:
                'Number of distinct interviews where this theme appeared. Must equal the count of unique interview_ids in source_theme_refs.',
              minimum: 1,
            },
            source_theme_refs: {
              type: 'array' as const,
              description:
                'References back to the per-interview themes that merged into this aggregate. Every ref must point to a theme name that actually appears in the named interview.',
              minItems: 1,
              items: {
                type: 'object' as const,
                required: ['interview_id', 'theme_name'],
                properties: {
                  interview_id: {
                    type: 'string' as const,
                    description: 'UUID of the source interview as provided in the user message.',
                  },
                  theme_name: {
                    type: 'string' as const,
                    description:
                      'The exact theme.name from that interview, character for character. Must match a theme that exists in the interview, not the aggregate name.',
                    minLength: 2,
                    maxLength: 60,
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
