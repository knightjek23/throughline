# Day 2 Upload Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Solo researcher can create a study, upload a .txt transcript, and watch it move from `queued` to `analyzed` (stub data) within ~10s.
**Architecture:** Multipart POST → Supabase Storage write → `interviews` row insert (`queued`) → QStash enqueue → background route updates `processing` → stub analysis writes to DB → status `analyzed`. UI polls every 2.5s while any row is in flight.
**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + Storage + RLS), Clerk auth, Upstash QStash + Redis (rate limit), Zod, Vitest.

---

## File map

**Create:**
- `app/api/studies/route.ts` — POST create study
- `app/api/studies/[studyId]/interviews/route.ts` — POST upload + enqueue, GET list
- `app/api/jobs/analyze-interview/route.ts` — QStash target with stub analysis
- `app/studies/[studyId]/page.tsx` — study detail with upload + interview list
- `tests/parsers/txt.test.ts` — unit tests for the txt parser
- `tests/anthropic/analyze.test.ts` — unit tests for stub analysis (verifies Zod schema)
- `lib/api/responses.ts` — small helper for typed JSON responses + error shapes

**Modify:**
- `lib/parsers/txt.ts` — already a stub, finish with edge cases (BOM, CRLF)
- `lib/anthropic/analyze.ts` — replace `throw` with stub that returns hardcoded valid `InterviewAnalysis`
- `app/studies/page.tsx` — wire to real DB, add "New study" form
- `vitest.config.ts` — already exists, no change needed
- `lib/supabase/types.ts` — regenerate after any schema change (none planned)

**Not touched (yet):**
- `lib/anthropic/synthesize.ts` — Day 4
- `lib/parsers/{vtt,srt,docx}.ts` — Day 2.5 fast follow
- Sentry, PostHog config files — already wired Day 1

---

## Task 1 — Finish the .txt parser with edge cases

Pure function, easy TDD. Existing stub at `lib/parsers/txt.ts`. Add a few robustness cases.

**Files:** `tests/parsers/txt.test.ts` (new), `lib/parsers/txt.ts` (modify)

- [ ] Write `tests/parsers/txt.test.ts` covering: happy path returns text + word count, empty file throws, file with only whitespace throws, file <50 words throws, file with BOM strips BOM, CRLF normalized to LF, file >500k chars throws
- [ ] Run `npm run test:rls -- tests/parsers` (or add a `test:unit` script). Confirm tests fail for the right reasons
- [ ] Implement / patch `lib/parsers/txt.ts` to pass each test one at a time
- [ ] All tests green
- [ ] Commit: `feat(parsers): finish txt parser with BOM/CRLF/edge cases`

---

## Task 2 — Stub analysis in `lib/anthropic/analyze.ts`

Pure function. Returns hardcoded valid `InterviewAnalysis` matching the Zod schema. Real Anthropic call comes Day 3.

**Files:** `tests/anthropic/analyze.test.ts` (new), `lib/anthropic/analyze.ts` (modify)

- [ ] Write `tests/anthropic/analyze.test.ts`: imports `analyzeInterview`, calls with fake input, asserts the returned object validates against `interviewAnalysisSchema` (Zod parse succeeds)
- [ ] Watch test fail (currently throws "not implemented")
- [ ] Modify `analyzeInterview` to return a hardcoded `AnalyzeResult` with: realistic-looking summary, sentiment `mixed`, 3 themes, 5 quotes (use the transcript text as the source for char_start/char_end so substring validation would pass even on the stub)
- [ ] Add a comment marking this as "Day 2 stub, replace Day 3"
- [ ] Test green
- [ ] Commit: `feat(anthropic): stub analyzeInterview returning valid schema for day 2 plumbing`

---

## Task 3 — POST `/api/studies` route

Create a study. Needs Clerk auth, rate limit, Zod body, RLS-context Supabase write.

**Files:** `app/api/studies/route.ts` (new), `lib/api/responses.ts` (new)

- [ ] Create `lib/api/responses.ts` with `jsonOk(data, status?)` and `jsonError(message, status, details?)` helpers
- [ ] Write `app/api/studies/route.ts`: POST handler. Auth check via `await auth()`. Apply `ratelimit.check('studyCreate', userId)`. Parse body via Zod (`name` 1-120 chars, `research_question` optional 0-280). Insert via `createServerClient()`. Return `{ id, name, research_question, created_at }`
- [ ] Manual test in dev: `curl -X POST localhost:3000/api/studies -H "..." -d '...'` returns 200 + study id. Verify row in Supabase Table Editor
- [ ] Rate-limit test: hit endpoint 6+ times in a minute, confirm 429 on the 6th (limit is 5/hour)
- [ ] Commit: `feat(api): POST /api/studies route with rate limit + zod`

---

## Task 4 — POST `/api/studies/:studyId/interviews` upload route

The load-bearing route. Multipart upload, validation, Storage write, DB insert, QStash enqueue.

**Files:** `app/api/studies/[studyId]/interviews/route.ts` (new)

- [ ] Stub handler that just receives multipart and returns 200, confirm in dev with a test file
- [ ] Add MIME validation: only `text/plain` for now, reject others with 415
- [ ] Add size validation: reject >10MB with 413
- [ ] Add ownership check: verify `studyId` belongs to the calling user before any work (RLS will also block, but fail fast)
- [ ] Parse with `parseTranscript(buf, mime, filename)` from `lib/parsers/index.ts`
- [ ] Upload to Supabase Storage at `{userId}/{studyId}/{interviewId}.txt` via admin client
- [ ] Insert interviews row: status `queued`, transcript_text, word_count, storage_path
- [ ] Enqueue QStash job with `{ interviewId, userId, studyId }` payload
- [ ] Return `{ id, status: 'queued', filename, word_count }`
- [ ] Rate limit applied: `ratelimit.check('upload', userId)`
- [ ] Manual test: upload a real 4k-word .txt transcript, verify Storage object exists, DB row created, QStash dashboard shows queued job
- [ ] Commit: `feat(api): POST interviews route with storage + queue enqueue`

---

## Task 5 — POST `/api/jobs/analyze-interview` (QStash target)

The background job. Verifies QStash signature, walks the status state machine, writes the stub analysis.

**Files:** `app/api/jobs/analyze-interview/route.ts` (new)

- [ ] Stub handler that verifies signature via `verifyJobRequest(req)` from `lib/qstash.ts`. Reject 401 if invalid
- [ ] On valid request, parse `{ interviewId, userId, studyId }` from body via Zod
- [ ] Update interview row: status `processing`
- [ ] Sleep 8 seconds (`await new Promise(r => setTimeout(r, 8000))`) to simulate Anthropic latency
- [ ] Read transcript from DB (need `transcript_text`)
- [ ] Call `analyzeInterview({ interviewId, transcript, researchQuestion, participantLabel })` (returns stub)
- [ ] Insert `interview_analyses` row with the returned data
- [ ] Update interview row: status `analyzed`, `analyzed_at = now()`
- [ ] On any error: set status `failed`, `failure_reason`, return 200 (don't ask QStash to retry on logic errors)
- [ ] Add Sentry breadcrumb at entry + at success
- [ ] Track PostHog event `interview_analyzed` (or `interview_failed`)
- [ ] Manual test: trigger via upload, watch DB rows flip status, verify `interview_analyses` row appears
- [ ] Commit: `feat(jobs): analyze-interview qstash target with stub + status state machine`

---

## Task 6 — GET `/api/studies/:studyId/interviews`

For polling. Returns list with status. Lightweight.

**Files:** `app/api/studies/[studyId]/interviews/route.ts` (modify, add GET)

- [ ] Add GET handler to the existing route file
- [ ] Auth check via `await auth()`
- [ ] RLS-context client query: select `id, filename, status, word_count, uploaded_at, analyzed_at, failure_reason` from `interviews` where `study_id = :studyId`, ordered by `uploaded_at desc`
- [ ] Return `{ interviews: [...] }`
- [ ] Manual test: hit endpoint after uploading, confirm list returns

---

## Task 7 — Minimal study list + creation UI

Wire `/studies` to real DB. Add "New study" form. Keep using the existing token system.

**Files:** `app/studies/page.tsx` (modify)

- [ ] Read existing `/studies` page, gut the placeholder JSON dump
- [ ] Server component: fetch user's studies via RLS-context client
- [ ] Render a list of studies (link each to `/studies/[id]`) using the editorial token palette
- [ ] Add a client form component (`app/studies/_components/new-study-form.tsx`) with name + optional research question fields
- [ ] Form posts to `/api/studies`, on success router.refresh()
- [ ] Show inline error if rate limit or validation fails
- [ ] Manual test: create 2 studies, see them in the list

---

## Task 8 — Study detail page with upload + interview list

The polling lives here. The visible test of Day 2.

**Files:** `app/studies/[studyId]/page.tsx` (new), `app/studies/[studyId]/_components/upload-form.tsx` (new), `app/studies/[studyId]/_components/interview-list.tsx` (new)

- [ ] Server component fetches study + initial interview list, passes to client `<InterviewList>`
- [ ] `<UploadForm>` client component: file input, POST to `/api/studies/[id]/interviews`, on success refresh
- [ ] `<InterviewList>` client component: takes initial list as prop, polls `/api/studies/[id]/interviews` every 2.5s while any row has status `queued` or `processing`. Stop polling when all rows are terminal (`analyzed` or `failed`). Render row with filename, status badge (color via tokens: queued = subtle gray, processing = warning yellow, analyzed = success green, failed = error red), word count, uploaded relative time
- [ ] No interview detail page yet — Day 5 ships that. Just show list
- [ ] Manual test: upload a transcript, watch the badge change from `queued` → `processing` → `analyzed` within ~10s without manual page refresh

---

## Task 9 — Production deploy + dogfood verification

The whole point of Day 2. Verify the hypothesis from the spec.

- [ ] Run typecheck locally: `npx tsc --noEmit`
- [ ] Run vitest: `npm run test:rls && npx vitest run tests/parsers tests/anthropic` (consider adding a unified `test` script)
- [ ] Commit + push to main, Vercel auto-deploys
- [ ] Add `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` to Vercel env vars
- [ ] Redeploy
- [ ] Test on production: create a study, upload one of Josh's past research transcripts, watch the status transitions
- [ ] Upload a `.pdf` to confirm rejection (415)
- [ ] Upload a fake oversized file to confirm rejection (413)
- [ ] Spam upload 11 times in 60s to confirm rate limit (429 on 11th)
- [ ] Rate the wait UX 1-5 in `docs/superpowers/specs/2026-05-13-day-2-upload-pipeline-design.md` "Success metric" section. If ≥3, hypothesis confirmed. If <3, decide: optimize polling cadence, add progress indicator, or accept and revisit in v1.1
- [ ] Commit: `chore(day-2): record dogfood rating + hypothesis result`

---

## Risks called out in spec — mitigation in this plan

| Risk | Mitigation in this plan |
|---|---|
| QStash signing verification fails | Task 5 step 1 |
| Polling feels jerky | Task 8: 2.5s cadence, stops when terminal. Optimistic UI deferred to v1.1 |
| Upload limit hits 10MB silently | Task 4: explicit 413 with clear message |
| Background job fails silently | Task 5: status `failed` + `failure_reason`, surfaced in Task 8 list |

---

## Out of scope (deferred)

- `.vtt`, `.srt`, `.docx` parsers — Day 2.5 fast follow
- Real Anthropic analysis — Day 3
- Aggregate cross-interview synthesis — Day 4
- Interview detail page — Day 5
- Drag and drop, batch upload, paste from clipboard — post-v1
- Supabase Realtime status streaming — v1.1 if polling proves bad
