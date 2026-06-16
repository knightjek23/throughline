# Day 4 implementation plan: aggregate cross-study synthesis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cross-study theme synthesis fires automatically on every upload past the 3rd, displayed as a second tab on the study page.
**Architecture:** Reuse Day 3's `lib/anthropic/` patterns. New synthesize tool + service + QStash job handler. Lift `stripEmDashes` into a shared helper.
**Tech Stack:** `@anthropic-ai/sdk`, existing Zod `studyThemesSchema`, QStash, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-02-day-4-aggregate-synthesis-design.md`

---

## File structure

**New:**
- `lib/anthropic/text-normalize.ts` — export `stripEmDashes()` lifted from validate-quotes for reuse
- `lib/anthropic/synthesize-tool.ts` — Anthropic tool spec `record_study_synthesis` mirroring `studyThemesSchema`
- `app/api/jobs/synthesize-study/route.ts` — QStash target
- `app/studies/[studyId]/_components/study-tabs.tsx` — client component, URL-driven tab state
- `app/studies/[studyId]/_components/aggregate-themes.tsx` — server component reading `study_themes`
- `tests/fixtures/sample-transcript-2.txt`
- `tests/fixtures/sample-transcript-3.txt`

**Modified:**
- `lib/anthropic/validate-quotes.ts` — import `stripEmDashes` from text-normalize
- `lib/anthropic/synthesize.ts` — full rewrite from Day 0 stub
- `lib/anthropic/prompts.ts` — fill in `SYNTHESIZE_SYSTEM_PROMPT` + add `buildSynthesizeUserMessage`
- `lib/qstash.ts` — add `enqueueSynthesizeStudy(studyId, userId)` helper
- `app/api/jobs/analyze-interview/route.ts` — enqueue synthesize when analyzed count >= 3
- `app/studies/[studyId]/page.tsx` — tabbed layout

**Test files:**
- `tests/anthropic/text-normalize.test.ts`
- `tests/anthropic/synthesize-tool.test.ts`
- `tests/anthropic/synthesize.test.ts`
- Extend `tests/anthropic/prompts.test.ts` with synthesize prompt cases

---

## Tasks

### Task 1: Extract text-normalize helper
- [ ] Write `text-normalize.test.ts` with cases for `stripEmDashes`
- [ ] Watch fail
- [ ] Create `lib/anthropic/text-normalize.ts` with exported `stripEmDashes`
- [ ] Update `lib/anthropic/validate-quotes.ts` to import from text-normalize, remove its inline copy
- [ ] Full suite green, commit `refactor(day-4): extract stripEmDashes to text-normalize`

### Task 2: Synthesize tool definition
- [ ] Write `synthesize-tool.test.ts`: name = `record_study_synthesis`, has description, top-level required = ['themes'], theme items require name/description/frequency/source_quote_refs, hand-rolled valid example round-trips through `studyThemesSchema`
- [ ] Watch fail
- [ ] Write `lib/anthropic/synthesize-tool.ts` exporting `recordStudySynthesisTool`
- [ ] Tests green, commit `feat(day-4): tool definition for record_study_synthesis`

### Task 3: Synthesize prompt + user message builder
- [ ] Extend `prompts.test.ts`: `SYNTHESIZE_SYSTEM_PROMPT` non-trivial, references tool name, mentions dedup, mentions frequency, forbids em dashes; `buildSynthesizeUserMessage` includes interview_id and themes for each interview, omits quote text, deterministic order
- [ ] Watch fail
- [ ] Update `lib/anthropic/prompts.ts`: fill `SYNTHESIZE_SYSTEM_PROMPT`, add `buildSynthesizeUserMessage`
- [ ] Tests green, commit `feat(day-4): synthesize system prompt + user message builder`

### Task 4: synthesizeStudy service
- [ ] Write `synthesize.test.ts` with mocked SDK: happy path with 3 interviews; <3 short-circuits; 5xx retry-once then ApiRetryExhaustedError; bad-format InvalidAnalysisFormatError; em dashes get stripped; source ref resolution picks first quote of each matched per-interview theme; aggregate theme with zero resolvable refs gets pruned; all-orphans throws NoGroundedThemesError
- [ ] Watch fail
- [ ] Rewrite `lib/anthropic/synthesize.ts`
- [ ] Tests green, commit `feat(day-4): real synthesizeStudy with cross-interview dedup`

### Task 5: QStash enqueue helper + synthesize-study job route
- [ ] Add `enqueueSynthesizeStudy(studyId, userId)` to `lib/qstash.ts`, with `Upstash-Deduplication-Id` header = studyId
- [ ] Write `app/api/jobs/synthesize-study/route.ts`: signature verify, payload parse, count gate, call synthesizeStudy, upsert `study_themes`, track `aggregate_synthesized` PostHog event
- [ ] Commit `feat(day-4): synthesize-study QStash route + enqueue helper`

### Task 6: Trigger synthesize from analyze handler
- [ ] After analyze writes `status='analyzed'`, count analyzed interviews for the study
- [ ] If count >= 3, call `enqueueSynthesizeStudy(studyId, userId)`. Failure to enqueue logs a warning but does not fail the analyze
- [ ] Commit `feat(day-4): trigger aggregate synthesis on 3rd analyzed interview`

### Task 7: Tabbed study page + aggregate view
- [ ] Convert `/studies/[id]/page.tsx` to render `<StudyTabs>` with `Interviews` and `Aggregate` tabs
- [ ] `study-tabs.tsx`: reads `?tab=` from URL, default `interviews`
- [ ] `aggregate-themes.tsx`: fetches `study_themes` row, renders cards with frequency badge; empty state when no synthesis exists ("Upload 3 interviews to unlock aggregate themes")
- [ ] Commit `feat(day-4): tabbed study page with aggregate view`

### Task 8: Fixtures + dogfood + rate
- [ ] Write `tests/fixtures/sample-transcript-2.txt` and `sample-transcript-3.txt` (overlapping + distinct themes for real dedup variance)
- [ ] Push to prod, upload all three to a fresh study, verify aggregate tab fills in
- [ ] Rate against the 3 hypothesis criteria
- [ ] Append dogfood result to spec, commit

---

## Verification gates

- After each task: targeted test green
- After Task 4: full suite green (no Day 3 regressions)
- After Task 7: `npx tsc --noEmit` passes
- After Task 8: hypothesis rated 3+/5

## Out of scope (per spec)

Drill-down to source quotes, manual rerun button, theme editing, multi-language, cross-study comparison.
