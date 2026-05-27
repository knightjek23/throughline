/**
 * Error classes for the Anthropic analysis pipeline.
 *
 * Each one maps to a distinct user-facing `failure_reason` written by the
 * job handler (see `app/api/jobs/analyze-interview/route.ts`). Keep these
 * pure-data: no I/O, no logging. The handler decides what to log.
 */

/**
 * Thrown when both attempts of an Anthropic call fail with retry-eligible
 * errors (5xx or network). The original last error is preserved as `cause`.
 */
export class ApiRetryExhaustedError extends Error {
  constructor(cause: unknown) {
    super('Anthropic API failed after retry.', { cause });
    this.name = 'ApiRetryExhaustedError';
  }
}

/**
 * Thrown when the transcript exceeds the 40k-token soft ceiling (estimated
 * via a word-count heuristic, not the real BPE tokenizer). The message is
 * the user-facing failure_reason copy directly, so the job handler can
 * surface `err.message` without remapping.
 */
export class TooLongError extends Error {
  constructor() {
    super('Transcript too long. Max 40k tokens, about 30k words.');
    this.name = 'TooLongError';
  }
}

/**
 * Thrown when quote substring validation drops every quote and every theme
 * loses its grounding. Means the model hallucinated the entire response,
 * or returned themes with quote.theme values that don't match any theme.
 * Either way, the analysis is unusable; better to fail loud and let the
 * user retry than ship an empty result.
 */
export class NoGroundedThemesError extends Error {
  constructor() {
    super('Analysis returned no grounded themes.');
    this.name = 'NoGroundedThemesError';
  }
}

/**
 * Thrown when Anthropic returned a response we can't parse:
 *  - No `tool_use` block in the content (model produced text only)
 *  - tool_use.input doesn't satisfy interviewAnalysisSchema
 * Either case means the model broke its contract; retry won't help since
 * temperature is 0 and the same prompt will produce the same broken shape.
 */
export class InvalidAnalysisFormatError extends Error {
  constructor() {
    super('Analysis returned invalid format.');
    this.name = 'InvalidAnalysisFormatError';
  }
}
