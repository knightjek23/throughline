/**
 * Maps an error thrown by analyzeInterview to the user-facing string
 * written into `interviews.failure_reason`.
 *
 * Design: every known error class (see ./errors.ts) carries its
 * user-facing copy directly in `err.message`, so the helper just
 * passes those through. Unknown errors (e.g. an Anthropic 400 that
 * surfaces around our retry wrapper, or a Supabase write failure)
 * get truncated to 200 chars so we never leak a 5KB stack trace into
 * the UI. Truly unrecognizable values fall back to "unknown error".
 *
 * Pure function. Caller (job handler) decides what to log.
 */

import {
  TooLongError,
  ApiRetryExhaustedError,
  InvalidAnalysisFormatError,
  NoGroundedThemesError,
} from './errors';

const MAX_RAW_MESSAGE_LENGTH = 200;
const UNKNOWN = 'unknown error';

const KNOWN_ERROR_CLASSES = [
  TooLongError,
  ApiRetryExhaustedError,
  InvalidAnalysisFormatError,
  NoGroundedThemesError,
];

export function failureReason(err: unknown): string {
  // Known classes carry the spec failure_reason in .message — pass through.
  if (KNOWN_ERROR_CLASSES.some((Cls) => err instanceof Cls)) {
    return (err as Error).message;
  }

  // Unknown Error: pass through if short, truncate with ellipsis if long.
  if (err instanceof Error && err.message) {
    if (err.message.length <= MAX_RAW_MESSAGE_LENGTH) {
      return err.message;
    }
    return err.message.slice(0, MAX_RAW_MESSAGE_LENGTH - 3) + '...';
  }

  return UNKNOWN;
}
