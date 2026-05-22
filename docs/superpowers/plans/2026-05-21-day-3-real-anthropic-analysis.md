# Day 3 implementation plan: real Anthropic analysis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real Anthropic analysis end-to-end, validated against transcript, hard-fail at boundaries.
**Architecture:** Add a small `lib/anthropic/` toolkit (client, tokens, prompt, tool, validator) and rewire the existing `analyzeInterview` to compose them. Contract to the QStash handler stays identical.
**Tech Stack:** `@anthropic-ai/sdk`, existing Zod schemas, PostHog server, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-21-day-3-real-anthropic-analysis-design.md`

---

## File structure

**New:**
- `lib/anthropic/client.ts` — Cached Anthropic client + `withRetry()` helper (retries on 5xx and network, not on 4xx)
- `lib/anthropic/errors.ts` — `TooLongError`, `ApiRetryExhaustedError`, `NoGroundedThemesError`, `InvalidAnalysisFormatError`
- `lib/anthropic/tokens.ts` — `estimateTokens(text)` and `assertWithinLimit(text)` (gate at 40k)
- `lib/anthropic/tool-definition.ts` — Tool spec for `record_interview_analysis` mirroring `interviewAnalysisSchema`
- `lib/anthropic/prompt.ts` — `buildSystemPrompt()` and `buildUserMessage({ transcript, researchQuestion, participantLabel })`
- `lib/anthropic/validate-quotes.ts` — `validateAndPrune(analysis, transcript)` returning `{ cleaned, droppedQuotes, droppedThemes }`; emits PostHog events
- `tests/fixtures/sample-transcript.txt` — Synthetic ~2k-word UX research interview for dogfood

**Modified:**
- `lib/anthropic/analyze.ts` — Replace stub body with the real composition. Keep input/output contract.
- `app/api/jobs/analyze-interview/route.ts` — Map new error types to specific `failure_reason` strings.
- `lib/env.ts` (or equivalent) and `.env.example` — Add `ANTHROPIC_API_KEY`.

**Test files (new, alongside each lib file):**
- `lib/anthropic/client.test.ts`
- `lib/anthropic/tokens.test.ts`
- `lib/anthropic/tool-definition.test.ts`
- `lib/anthropic/prompt.test.ts`
- `lib/anthropic/validate-quotes.test.ts`
- `lib/anthropic/analyze.test.ts`

---

## Tasks

### Task 1: Anthropic SDK + retry wrapper
- [ ] Write `client.test.ts`: retry helper retries on 500, doesn't retry on 400, gives up after 2 attempts and throws `ApiRetryExhaustedError`
- [ ] Run, watch fail (no file yet)
- [ ] Install `@anthropic-ai/sdk`; add `ANTHROPIC_API_KEY` to `.env.example` and validate in env
- [ ] Write `client.ts` exporting `getAnthropic()` (cached) and `withRetry<T>(fn)`
- [ ] Run tests green, commit `feat(day-3): anthropic sdk + retry wrapper`

### Task 2: Token estimator + length gate
- [ ] Write `tokens.test.ts`: known string of 100 words estimates ~130 tokens; `assertWithinLimit` throws `TooLongError` at 40k+, passes at 39.9k
- [ ] Run, watch fail
- [ ] Write `errors.ts` with `TooLongError`
- [ ] Write `tokens.ts` with `estimateTokens()` and `assertWithinLimit()`
- [ ] Run tests green, commit `feat(day-3): token estimator + length gate`

### Task 3: Tool definition
- [ ] Write `tool-definition.test.ts`: shape snapshot; a valid hand-rolled example round-trips through `interviewAnalysisSchema.parse`
- [ ] Run, watch fail
- [ ] Write `tool-definition.ts` exporting `recordInterviewAnalysisTool` (Anthropic tool format JSON Schema)
- [ ] Run tests green, commit `feat(day-3): tool definition for analysis`

### Task 4: Prompt builders
- [ ] Write `prompt.test.ts`: system prompt is non-empty + mentions verbatim quotes + theme cap; user message includes RQ when present and omits when null; participantLabel appears when given
- [ ] Run, watch fail
- [ ] Write `prompt.ts` with both builders. System prompt explicitly invites 1-2 off-RQ themes when transcript signal is strong.
- [ ] Run tests green, commit `feat(day-3): prompt builders`

### Task 5: Quote validator + orphan pruner + PostHog events
- [ ] Write `validate-quotes.test.ts`: (a) exact match passes; (b) off-by-N char positions get fixed via indexOf; (c) quote text not in transcript gets dropped; (d) orphan theme pruned when last quote drops; (e) all-themes-orphaned throws `NoGroundedThemesError`; (f) PostHog captureServer called once per drop
- [ ] Run, watch fail
- [ ] Add `NoGroundedThemesError` to `errors.ts`
- [ ] Write `validate-quotes.ts` with `validateAndPrune()`; mock PostHog in test via existing test infrastructure
- [ ] Run tests green, commit `feat(day-3): quote validator + orphan pruner`

### Task 6: Wire it all into analyzeInterview
- [ ] Write `analyze.test.ts`: with `@anthropic-ai/sdk` mocked, (a) happy path returns valid analysis; (b) >40k transcript throws TooLongError before API call; (c) 500 from API retries once, then `ApiRetryExhaustedError`; (d) bad-format response throws `InvalidAnalysisFormatError`; (e) all-hallucinated quotes throws `NoGroundedThemesError`; (f) some-hallucinated quotes returns cleaned analysis with `droppedQuotes > 0`
- [ ] Run, watch fail
- [ ] Add `InvalidAnalysisFormatError` to `errors.ts`
- [ ] Replace `analyze.ts` body: token gate → buildPrompts → withRetry(client.messages.create) → extract tool_use → schema parse → validateAndPrune → return. Keep `AnalyzeInput`/`AnalyzeResult` contract.
- [ ] Delete stub themes and `buildStubQuotes` (no longer needed)
- [ ] Run tests green, commit `feat(day-3): replace analyze stub with real anthropic call`

### Task 7: Job handler failure_reason mapping
- [ ] Update existing job handler tests (or add one) to assert the right `failure_reason` writes for each error type from Task 6
- [ ] Run, watch fail
- [ ] Modify `app/api/jobs/analyze-interview/route.ts`: catch each error class, write the spec's failure_reason string. Truncate any raw API error message to 200 chars.
- [ ] Run tests green, commit `feat(day-3): map analysis errors to user-facing failure reasons`

### Task 8: Sample fixture + dogfood
- [ ] Create `tests/fixtures/sample-transcript.txt` (synthetic 2k-word UX research interview about onboarding)
- [ ] `npm run dev`, create a study with a real research question, upload the fixture
- [ ] Wait for analyzed status, then `select * from interview_analyses` to read the output
- [ ] Rate against the spec's 3-criteria hypothesis. If <3/5 on any criterion, tune prompt in Task 4 file and re-run.
- [ ] When 3+/5: optionally swap in a real anonymized Josh transcript and re-rate
- [ ] Document the dogfood result in a short note appended to the spec

---

## Verification gates

- After each task: `npm test -- <new-test-file>` green
- After Task 6: `npm test` green (full suite, no regressions)
- After Task 8: hypothesis rated 3+/5 with notes

## Out of scope (per spec)

Chunking, retry UI button, interview detail page, aggregate synthesis, prompt caching, streaming.
