/**
 * Anthropic tool definition for `record_interview_analysis`.
 *
 * Passed to `client.messages.create({ tools: [recordInterviewAnalysisTool] })`
 * with `tool_choice: { type: 'tool', name: 'record_interview_analysis' }`
 * to force structured output. The shape mirrors `interviewAnalysisSchema`
 * (Zod) so any response Claude makes here round-trips cleanly through
 * `interviewAnalysisSchema.parse()` post-call.
 *
 * The descriptions on each field are read by the model as part of tool
 * understanding, so they're written as instructions, not docs. Be specific
 * about substring requirements and the 1-2 off-RQ surprise theme allowance.
 */

export const recordInterviewAnalysisTool = {
  name: 'record_interview_analysis',
  description:
    'Record the structured analysis of a single research interview transcript. Call exactly once, after reading the entire transcript. Every quote must be a verbatim substring of the transcript with correct char_start and char_end positions. Every theme must have at least one quote backing it.',
  input_schema: {
    type: 'object' as const,
    required: ['summary', 'sentiment', 'themes', 'quotes'],
    properties: {
      summary: {
        type: 'string' as const,
        description:
          'Two to four sentences describing what the participant talked about and the overall tenor of the conversation. 20 to 800 characters.',
        minLength: 20,
        maxLength: 800,
      },
      sentiment: {
        type: 'string' as const,
        description:
          'Overall emotional tone of the participant across the interview. Use "mixed" when both positive and negative signal are present.',
        enum: ['positive', 'mixed', 'negative', 'neutral'],
      },
      themes: {
        type: 'array' as const,
        description:
          'Distinct themes from the transcript. Bias selection toward the research question, but include 1 to 2 surprising off-research-question themes if the transcript signal is strong. 1 to 7 themes total.',
        minItems: 1,
        maxItems: 7,
        items: {
          type: 'object' as const,
          required: ['name', 'description'],
          properties: {
            name: {
              type: 'string' as const,
              description:
                'Short, specific label for the theme. Avoid generic words like "feedback" or "issues" on their own.',
              minLength: 2,
              maxLength: 60,
            },
            description: {
              type: 'string' as const,
              description:
                'One to two sentences explaining what the theme captures and why it surfaced.',
              minLength: 10,
              maxLength: 280,
            },
          },
        },
      },
      quotes: {
        type: 'array' as const,
        description:
          'Verbatim quotes from the transcript that ground each theme. Every quote text must be an EXACT substring of the transcript. char_start and char_end must be the actual character positions in the transcript. Aim for 1 to 4 quotes per theme.',
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'object' as const,
          required: ['text', 'theme', 'char_start', 'char_end'],
          properties: {
            text: {
              type: 'string' as const,
              description:
                'Exact verbatim substring of the transcript. Do not paraphrase. Do not add ellipses or quotation marks. 10 to 600 characters.',
              minLength: 10,
              maxLength: 600,
            },
            theme: {
              type: 'string' as const,
              description:
                'Name of the theme this quote supports. Must match one of the theme names above exactly, character for character.',
              minLength: 2,
              maxLength: 60,
            },
            char_start: {
              type: 'integer' as const,
              description: 'Zero-based index of the first character of `text` in the transcript.',
              minimum: 0,
            },
            char_end: {
              type: 'integer' as const,
              description:
                'Zero-based index one past the last character of `text` in the transcript. transcript.slice(char_start, char_end) must equal text.',
              minimum: 1,
            },
          },
        },
      },
    },
  },
};
