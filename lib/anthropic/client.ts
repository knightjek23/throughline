/**
 * Singleton Anthropic client. All routes go through analyze() / synthesize() —
 * no raw `client.messages.create` outside this folder.
 */

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (cached) return cached;
  cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cached;
}

export const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
