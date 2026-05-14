# Day 2 — Upload pipeline (v0)

**Date:** 2026-05-13
**Owner:** Josh
**Status:** Draft, awaiting approval

## Problem

A solo researcher has a transcript on their laptop and wants Throughline to do its thing. Today we can't accept the file. Without an ingest path, none of the analysis or synthesis work matters. The riskiest UX assumption in our v1 architecture is "async with a status indicator is a good wait experience". Day 2 is the smallest test of that.

## Why this matters now

Day 1 shipped the foundation. Day 3 ships the real analysis engine. Day 2 is the pipeline that connects them: file in, queued, status moves through `queued → processing → analyzed`. Without Day 2 working, Day 3 has nothing to call. Day 5 (dashboard) has nothing to display.

## Success metric (hypothesis)

**We believe** uploading a .txt transcript and watching it move from `queued` to `analyzed` (with stub data) **will feel acceptable** for a researcher used to "wait 30s then come back", **measured by** Josh dogfooding the flow with at least 3 real transcripts from past projects and rating the wait UX 3+ out of 5.

## Job To Be Done

When I (solo researcher) have just finished an interview transcript, I want to drop it into Throughline and walk away, so I can get themes and quotes back without sitting in a synchronous flow.

## Scope (v0)

In:

- `.txt` parser only (universal fallback, covers Otter manual exports, MacWhisper output, etc.)
- POST upload route with size/MIME validation, transcript stored in Supabase Storage
- QStash job enqueue on upload
- Background job route that simulates analysis (sleep 5-10s, then write stub analysis to DB)
- Status transitions: `queued → processing → analyzed`
- Minimal UI: study creation form, file upload form, interview list with status badges
- Polling-based status refresh (every 2.5s while a row is in queued/processing)

Out (deferred):

- `.vtt`, `.srt`, `.docx` parsers (Day 2.5 fast follow)
- Real Anthropic call (Day 3)
- Supabase Realtime status streaming (v1.1 if polling proves janky)
- Aggregate cross-interview synthesis (Day 4)
- Visual design polish (Day 7)
- Drag-and-drop, batch uploads, paste-from-clipboard (post-v1)

## Solution sketch

**Routes**

- `POST /api/studies` — create study (name + research_question)
- `POST /api/studies/:studyId/interviews` — multipart upload, validates MIME + size, stores in Supabase Storage, inserts `interviews` row with `status='queued'`, enqueues QStash job, returns interview id
- `POST /api/jobs/analyze-interview` — QStash target, signature-verified, updates status to `processing`, sleeps 8s, writes stub analysis row, updates status to `analyzed`
- `GET /api/studies/:studyId/interviews` — list (used by UI polling)

**UI pages**

- `/studies` — list of studies + "New study" form (already exists as placeholder, gets real)
- `/studies/[id]` — list of interviews for that study + upload input + status badges. Polls every 2.5s while any row is in-flight.

**Service layer**

- `lib/parsers/txt.ts` — already stubbed, finish it
- `lib/anthropic/analyze.ts` — replace `throw 'not implemented'` with stub that writes hardcoded analysis
- `lib/qstash.ts` — already wired, just verify enqueue works end-to-end
- `lib/ratelimit.ts` — apply `upload` and `studyCreate` limits

**Stub analysis data**

For Day 2 only, the stub returns identical content for every interview:

```ts
{
  summary: "User research participant discussed their workflow and pain points around their current tools.",
  sentiment: "mixed",
  themes: [
    { name: "Onboarding friction", description: "..." },
    { name: "Manual workarounds", description: "..." },
    { name: "Cost sensitivity", description: "..." }
  ],
  quotes: [...]  // generic placeholder quotes
}
```

This lets us prove the pipeline without burning Anthropic tokens before Day 3.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| QStash signing verification fails in prod | Medium | High | Test enqueue + verify in dev with a real QStash project before deploy |
| Polling every 2.5s feels jerky | Medium | Medium | Optimistic UI: show "processing" immediately on upload, don't wait for poll |
| Supabase Storage upload limit hits 10MB | Low | Medium | Already capped in DB migration; surface clear error |
| File contains malicious content (XSS via interview content) | Low | Medium | Defer rendering to Day 3 (just store text), but escape if rendering anywhere |
| Background job takes >800s | Low | Low | Stub is 8s, real Anthropic Day 3 is bounded |

## Open questions

1. Should rate limit apply to QStash callback route, or only user-facing routes? (Recommendation: skip rate limit on QStash routes, just verify signature)
2. If the QStash job fails twice, do we surface the error in UI or just log it? (Recommendation: set status `failed` with `failure_reason`, render in UI)
3. Optimistic UI: show "uploading..." with a fake interview row immediately, or wait for the POST response? (Recommendation: wait for response, it's <1s)

## Non-goals (deliberate cuts)

- Pretty UI — this is functional only, Day 7 polishes
- File preview / inline transcript reading — Day 5
- Editing interviews / deleting them — Day 5
- Per-interview re-analysis trigger — Day 4
- Webhooks notifying when analysis completes — never (we're synchronous from user's POV via polling)
- Bulk upload — never in v1
- Drag and drop — Day 7

## Acceptance criteria

Day 2 is done when:

- I can create a new study from the UI
- I can upload a real `.txt` transcript (one of my past research transcripts)
- The interview appears in the list with `status: queued` within 1s of upload
- Within ~10s, status transitions through `processing` to `analyzed`
- The stub analysis (themes, quotes, summary) is visible in the DB
- The same flow works on production after deploy
- Upload of a non-txt file (e.g., `.pdf`) is rejected with a clear error
- Upload of a file >10MB is rejected
- Rate limit (10 uploads/hour) triggers after 11 rapid attempts
- QStash signing key works in dev and prod
