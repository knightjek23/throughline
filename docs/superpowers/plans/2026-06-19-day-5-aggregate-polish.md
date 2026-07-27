# Day 5 implementation plan: aggregate polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drill-down + re-synthesize + auto-poll. Three connected pieces that ship together.
**Architecture:** Hybrid server+client components. Server fetches and resolves; client manages expand/pending state. One new tiny GET endpoint for polling.
**Tech Stack:** Next.js App Router, existing Supabase + Clerk auth, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-06-19-day-5-aggregate-polish-design.md`

---

## File structure

**New:**
- `app/studies/[studyId]/_components/aggregate-theme-list.tsx` — client component, expand state + re-synthesize button + pending UI
- `app/studies/[studyId]/interviews/[interviewId]/_components/interview-detail-poller.tsx` — client wrapper, polls status, refreshes on transition
- `app/api/studies/[studyId]/interviews/[interviewId]/status/route.ts` — GET endpoint returning `{ status, failure_reason }`

**Modified:**
- `app/studies/[studyId]/_components/aggregate-themes.tsx` — fetches per-interview analyses, resolves drill-down data, delegates rendering to AggregateThemeList
- `app/studies/[studyId]/interviews/[interviewId]/page.tsx` — wraps content in InterviewDetailPoller, passes initial status

---

## Tasks

### Task 1: Drill-down server-side resolution + UI
- [ ] In `aggregate-themes.tsx`: after fetching `study_themes`, collect distinct interview_ids from all `source_quote_refs`. Fetch those interviews with `interview_analyses` join.
- [ ] For each aggregate theme, build `ResolvedDrillDownEntry[]`: per source_quote_ref, look up interview filename + quotes_json[quote_index] to get quote text + source theme name (from the quote.theme field).
- [ ] Create `aggregate-theme-list.tsx` (client): receives theme rows with embedded drillDown arrays. Renders cards. Manages `Set<themeId>` of expanded cards. On click, toggle.
- [ ] Inline-expanded view: per drillDown entry show `filename — original theme: source_theme_name` header, then italicized quote block with terracotta left-rule.
- [ ] Aggregate-themes.tsx renders `<AggregateThemeList rows={themesWithDrillDown} studyId={studyId} />`.
- [ ] Manual test: tap a theme, verify expand, verify quotes grouped by interview with source theme names. Re-tap collapses.
- [ ] Commit `feat(day-5): inline drill-down for aggregate themes`

### Task 2: Re-synthesize button
- [ ] In `aggregate-theme-list.tsx`, add a header bar above themes with a small "Re-synthesize" button right-aligned.
- [ ] State: `pending: boolean`, `error: string | null`. On click, POST `/api/studies/${studyId}/synthesize`. On success, `router.refresh()`. On failure, set error.
- [ ] During pending: button text "Synthesizing...", disabled. Themes list gets `opacity-50 transition-opacity`.
- [ ] Error renders below button with `.t-body-m` + color-error.
- [ ] Manual test: click button, watch themes gray, click again after refresh to verify second run.
- [ ] Commit `feat(day-5): re-synthesize button on aggregate themes`

### Task 3: Status endpoint for interview polling
- [ ] Create `app/api/studies/[studyId]/interviews/[interviewId]/status/route.ts`
- [ ] GET handler: Clerk auth check, RLS-context server client fetches `select status, failure_reason from interviews where id = $interviewId and study_id = $studyId`, returns `jsonOk({ status, failure_reason })`. 404 if not found.
- [ ] No tests for this route (matches existing patterns).
- [ ] Commit `feat(day-5): interview status endpoint for polling`

### Task 4: Interview detail poller
- [ ] Create `interview-detail-poller.tsx` client component
- [ ] Props: `studyId`, `interviewId`, `initialStatus`, `children`
- [ ] State: `status` initialized from initialStatus. useRef for the interval handle.
- [ ] useEffect: if status is `queued` or `processing`, setInterval(2.5s) that fetches `/api/studies/[studyId]/interviews/[interviewId]/status`. On status change, calls `router.refresh()` and clears interval. Cleanup on unmount clears interval.
- [ ] Returns children unchanged (lets server-rendered content render as-is).
- [ ] Commit `feat(day-5): interview detail page auto-polling`

### Task 5: Wire poller into interview detail page
- [ ] In `interview/[interviewId]/page.tsx`: wrap the main JSX in `<InterviewDetailPoller studyId={studyId} interviewId={interviewId} initialStatus={interview.status}>` ... `</InterviewDetailPoller>`.
- [ ] Verify the page server-renders correctly with the wrapper in place (no UI change in the static case).
- [ ] Manual test: upload a new interview, navigate to detail page while queued, watch transition without manual refresh.
- [ ] Commit `feat(day-5): wire auto-poller into interview detail page`

### Task 6: Dogfood + verify
- [ ] On prod, open existing dogfood study with 3 analyzed interviews + aggregate.
- [ ] Tap each aggregate theme, verify drill-down renders grouped by interview with source theme names + real quotes.
- [ ] Hit Re-synthesize. Verify pending UI. Verify new themes render.
- [ ] Upload a 4th interview. While queued/processing, click into the detail page. Watch auto-transition.
- [ ] Rate against the 3-criterion hypothesis. If 3+/5, append result to spec, commit.

---

## Verification gates

- After Task 1: drill-down expand/collapse works manually
- After Task 2: button triggers synthesis, pending state visible
- After Task 4: full test suite green (`npm test`)
- After Task 5: `npx tsc --noEmit` clean
- After Task 6: hypothesis rated 3+/5

## Out of scope (per spec)

Theme editing, theme archiving, URL-deep-linkable expanded state, transcript drill-down, editable source_quote_refs.
