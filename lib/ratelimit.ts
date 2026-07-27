/**
 * Rate limit wrapper using Upstash Redis sliding window.
 * Limits per roadmap §4 security:
 *   - 10 uploads/hour per user
 *   - 5 study creations/hour per user
 *   - 60 theme edits/min per user
 *   - 20 auth requests/min per IP
 */

import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const limits = {
  upload:       new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 h'),  prefix: 'rl:upload' }),
  studyCreate:  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5,  '1 h'),  prefix: 'rl:study' }),
  themeEdit:    new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m'),  prefix: 'rl:theme' }),
  auth:         new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '1 m'),  prefix: 'rl:auth' }),
  // Synthesis is the most expensive call in the app (30-60s Anthropic run).
  synthesize:   new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 h'),  prefix: 'rl:synth' }),
} as const;

export type LimitName = keyof typeof limits;

export async function check(name: LimitName, identifier: string) {
  return limits[name].limit(identifier);
}
