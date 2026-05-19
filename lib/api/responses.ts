/**
 * Typed JSON response helpers for App Router route handlers.
 * Keeps response shapes consistent across the API surface and lets the UI
 * write narrow type guards on the error case.
 */

import 'server-only';
import { NextResponse } from 'next/server';

export type ApiError = {
  error: string;
  details?: unknown;
};

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status: number, details?: unknown): NextResponse {
  const body: ApiError = { error: message };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}

/** 401 helper for routes that require auth. */
export function jsonUnauthorized(): NextResponse {
  return jsonError('unauthorized', 401);
}

/** 429 helper with the standard rate-limit response shape. */
export function jsonRateLimited(retryAfterSeconds?: number): NextResponse {
  const response = jsonError('rate_limited', 429);
  if (retryAfterSeconds !== undefined) {
    response.headers.set('Retry-After', String(retryAfterSeconds));
  }
  return response;
}
