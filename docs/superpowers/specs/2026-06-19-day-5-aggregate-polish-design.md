# Day 5 design: aggregate polish

**Status:** approved 2026-06-19
**Author:** Claude + Josh

## Goal

Make the aggregate experience feel done. Three pieces:

1. **Drill-down on aggregate themes** so source quotes are visible without leaving the page
2. **Re-synthesize button** so users can rerun synthesis after uploading more interviews
3. **Auto-poll on interview detail page** so analysis status updates without manual refresh

## Hypothesis

After Day 5 ships:

1. A researcher reading the Aggregate tab can verify any aggregate theme by tapping it and seeing the actual transcript quotes that contributed, grouped by interview. They never leave the Aggregate tab.
2. After uploading a 4th or 5th interview, the researcher re-runs synthesis with one click and sees updated aggregate in 30 to 60 seconds.
3. After uploading an interview and clicking into it, the detail page transitions from "Analysis in progress" to the rendered analysis without a manual refresh.

3+/5 on each, same dogfood bar as before.

## Architecture

### Drill-down

`aggregate-themes.tsx` server component fetches `study_themes` rows AND the referenced per-interview analyses (filename + themes_json + quotes_json) in the same render pass. Pre-resolves the drill-down content for each aggregate theme:

```ts
type ResolvedDrillDown = Array<{
  interview_id: string;
  interview_filename: string;
  source_theme_name: string;
  quotes: string[];
}>;
```

The resolved structure + theme rows get handed to a new client component `AggregateThemeList` which manages expand state per card. Tapping toggles. Inline expansion reveals source-quotes-grouped-by-interview, with the matched per-interview source theme name shown above each group so the dedup logic is visible.

### Re-synthesize button

Small button in the Aggregate tab header, right of the themes list section title. Hits the same `POST /api/studies/[studyId]/synthesize` endpoint that the empty-state CTA already calls. During pending: button shows "Synthesizing...", existing themes list gets opacity 0.5. On success, `router.refresh()` re-renders with new themes.

### Auto-poll on interview detail page

Today the detail page is a single server component. Refactor:
- Server component fetches initial state (filename, status, analysis if present)
- New client wrapper `InterviewDetailPoller` accepts initial props
- While `status` is `queued` or `processing`, polls `GET /api/studies/[studyId]/interviews/[interviewId]/status` every 2.5s
- When status transitions to `analyzed` or `failed`, fires `router.refresh()` once, then stops polling

That status endpoint is new but small: returns `{ status, failure_reason }`.

## Decisions locked

1. **Drill-down interaction:** inline expand on card tap. State is local to the client component (no URL persistence in v1).
2. **Quote presentation:** grouped by interview, with the matched per-interview source theme name shown so users see how dedup worked. Quotes get the serif-italic-with-terracotta-left-rule treatment from the interview detail page.
3. **Re-synthesize confirmation:** none. Cheap to re-run, no editable state to protect.
4. **Re-synthesize placement:** small button above the themes list, right side.
5. **Auto-poll interval:** 2.5 seconds, matches InterviewList.

## Failure modes

| Failure | Detection | Behavior |
|---|---|---|
| quote_index out of bounds | Server resolution | Render the theme card without that quote, log warn server-side |
| Source theme name doesn't match any per-interview theme | Server resolution | Render group with "Source theme unavailable" placeholder; quotes still show |
| Re-synthesize call fails | Existing error path | Surface failure_reason below button, themes return to full opacity |
| Polling network hiccup | Try/catch in tick | Swallow, retry next tick |

## Out of scope

- Theme editing (rename + description), v1.1
- Theme archiving, v1.1
- URL-deep-linkable expanded state, v1.1
- Drill-down into the original transcript at the quote's char position, v2
- Editable source_quote_refs, never
