/**
 * System prompts. Wrapped here so the cache_control configuration
 * stays in one place. Day 3 / Day 4 fill in the actual prompt content.
 *
 * Prompt-caching note: the system prompt is cached (10% of input cost) when
 * stable across calls. Keep transcript / variable inputs in user messages.
 */

export const ANALYZE_SYSTEM_PROMPT = `You are a research analyst. (Day 3: drop in v0 prompt here.)`;

export const SYNTHESIZE_SYSTEM_PROMPT = `You synthesize cross-interview themes. (Day 4: drop in v0 prompt here.)`;
