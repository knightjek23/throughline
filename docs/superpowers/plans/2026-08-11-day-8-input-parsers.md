# Day 8 Input Parsers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four ways to get a transcript into Throughline where today there is one, including Dovetail's exact CSV export shape.

**Architecture:** Pure parsers under `lib/parsers/` all return the existing `ParseResult`, except CSV which returns `ParsedInterview[]` because a CSV is not one transcript. The router switches on extension first and MIME second. The upload route grows a paste path and keeps its 1:1 shape; CSV gets its own capped import endpoint.

**Tech Stack:** Next.js 16.2.4, Zod 4, vitest 4, fflate 0.8.3, Supabase Storage.

**Spec:** `docs/superpowers/specs/2026-08-11-day-8-input-parsers-design.md`, approved 2026-08-11.

---

## Constraints carried from Day 7

Do not run `git` in this repo through the device bridge. The bridge cannot delete files, so every git call leaves a `.git/index.lock` it cannot unlink. All commits are Josh's, from his own terminal.

Do not run `vitest` against the repo's `node_modules` through the bridge either: they hold Windows native rolldown bindings and the bridge is a Linux VM. Pure-module tests are developed and run in a mirror, and Josh runs the real suite.

Do not add a DOM shim to the test suite. See the Day 7 spec for why. Nothing in Day 8 needs one.

---

## File structure

**New**

| File | Responsibility |
|---|---|
| `lib/parsers/cues.ts` | Pure. Cue list to speaker-labelled prose, including rolling-caption overlap trimming. Shared by VTT and SRT. |
| `lib/parsers/vtt.ts` | WEBVTT to cues. Strips headers, NOTE/STYLE/REGION blocks, cue ids, timestamps. Reads `<v Speaker>`. |
| `lib/parsers/srt.ts` | SubRip to cues. Strips sequence numbers, timecodes, `{\an8}` and `<i>` formatting. Reads `Speaker:` prefixes. |
| `lib/parsers/docx.ts` | fflate unzip of `word/document.xml`, then XML to text with `<w:p>` as paragraph boundary. |
| `lib/parsers/csv.ts` | RFC 4180 reader plus the Dovetail Title/Content shape. Returns `ParsedInterview[]`. |
| `app/api/studies/[studyId]/import/route.ts` | Capped CSV import, own rate-limit bucket, per-row fan-out. |
| `app/studies/[studyId]/_components/paste-form.tsx` | Paste tab. |
| `app/studies/[studyId]/_components/import-form.tsx` | Import tab with row preview. |
| `supabase/migrations/0002_import_mime_types.sql` | Adds `text/csv` and `application/csv` to the bucket whitelist. |
| `tests/parsers/{cues,vtt,srt,docx,csv}.test.ts` | Unit tests, written first. |
| `tests/fixtures/` | A rolling-caption VTT, a clean speaker VTT, an SRT, a generated docx, a Dovetail-shaped CSV, a CSV with embedded newlines. |

**Modified**

| File | Change |
|---|---|
| `lib/parsers/index.ts` | Extension-first routing, four new types, CSV excluded from the single-transcript path. |
| `app/api/studies/[studyId]/interviews/route.ts` | Full `ENABLED_MIMES`, extension derived from validated type, `text` field paste path. |
| `app/studies/[studyId]/_components/upload-form.tsx` | Three tabs. |
| `lib/ratelimit.ts` | An `import` bucket. |
| `package.json` | `fflate`. |

---

## Task 1: Cue list to prose

The riskiest pure logic in Day 8. Rolling-caption dedup is the one thing here that can silently produce wrong data instead of an error, and every character offset in Day 7's evidence spine depends on it.

- [ ] Create `tests/parsers/cues.test.ts` with one failing test: two cues from the same speaker merge into one paragraph.
- [ ] Run `npx vitest run tests/parsers/cues` and confirm it fails because the module does not exist.
- [ ] Create `lib/parsers/cues.ts` with the minimum to pass.
- [ ] Add a failing test: a speaker change starts a new block, formatted `Speaker: text`.
- [ ] Implement, confirm green.
- [ ] Add a failing test for rolling captions: cues `"the onboarding"`, `"the onboarding flow lost"`, `"flow lost me at the second"` produce `"the onboarding flow lost me at the second"` once, not three overlapping copies.
- [ ] Implement the longest-suffix-to-prefix overlap trim, confirm green.
- [ ] Add a failing test that overlap trimming only fires on a genuine overlap: a cue starting with a word that also ends the previous cue by coincidence ("we talked about the flow" then "flow charts are different") must not be trimmed into nonsense. Decide and document the minimum overlap length.
- [ ] Implement, confirm green.
- [ ] Add failing tests for: no speakers anywhere produces unlabelled paragraphs; a single cue produces one block; empty cue text is skipped; whitespace inside a cue is collapsed but paragraph boundaries survive.
- [ ] Implement, confirm green.
- [ ] Run the full suite.

**Files:** create `lib/parsers/cues.ts`, `tests/parsers/cues.test.ts`.

**Commit:** `feat(parsers): cue list to speaker-labelled prose with rolling-caption dedup`

---

## Task 2: VTT

- [ ] Failing test: a minimal WEBVTT file with two cues parses to two cues with the right text.
- [ ] Implement `lib/parsers/vtt.ts` to pass.
- [ ] Failing tests: `<v Speaker>` voice tags become the speaker; `NOTE`, `STYLE` and `REGION` blocks are dropped; cue identifiers before the timestamp line are dropped; `-->` lines with positioning settings (`align:start line:0%`) still parse.
- [ ] Implement each, confirming green between.
- [ ] Failing test: a file with no `WEBVTT` header, or with zero cues, throws rather than returning empty.
- [ ] Implement, confirm green.
- [ ] Wire `parseVtt` to return `ParseResult` via `cuesToProse`, and test the round trip on the rolling-caption fixture.

**Files:** create `lib/parsers/vtt.ts`, `tests/parsers/vtt.test.ts`, fixtures.

**Commit:** `feat(parsers): WEBVTT input`

---

## Task 3: SRT

- [ ] Failing test: a minimal SRT with two subtitles parses to two cues.
- [ ] Implement `lib/parsers/srt.ts`.
- [ ] Failing tests: sequence numbers dropped; comma-decimal timecodes (`00:00:01,000`) accepted; `{\an8}` and `<i>`/`<b>`/`<font>` tags stripped; `Speaker:` prefix lifted into the speaker field; CRLF line endings handled.
- [ ] Implement each, confirming green between.
- [ ] Failing test: zero subtitles throws.
- [ ] Implement, confirm green.

**Files:** create `lib/parsers/srt.ts`, `tests/parsers/srt.test.ts`, fixtures.

**Commit:** `feat(parsers): SubRip input`

---

## Task 4: docx

- [ ] `npm i fflate` in the mirror, and add it to the repo's `package.json`.
- [ ] Build a real .docx fixture by zipping a minimal OOXML package, so the test runs against a genuine container rather than a mock.
- [ ] Failing test: a docx with two paragraphs extracts both, separated by a blank line.
- [ ] Implement `lib/parsers/docx.ts`: unzip, locate `word/document.xml`, extract.
- [ ] Failing tests: multiple `<w:t>` runs inside one `<w:p>` concatenate without a space inserted between them; `<w:tab/>` becomes a tab; `<w:br/>` becomes a newline inside the paragraph; XML entities (`&amp;`, `&#39;`) decode; `xml:space="preserve"` runs keep their leading and trailing spaces.
- [ ] Implement each, confirming green between.
- [ ] Failing tests for the failure modes: a buffer that is not a zip throws; a zip with no `word/document.xml` throws; an encrypted docx (which has no readable document part) throws the protection-specific message.
- [ ] Implement, confirm green.

**Files:** create `lib/parsers/docx.ts`, `tests/parsers/docx.test.ts`, fixture builder.

**Commit:** `feat(parsers): docx input via fflate`

---

## Task 5: CSV and the Dovetail shape

- [ ] Failing test: a two-row CSV with `Title,Content` headers returns two `ParsedInterview`s.
- [ ] Implement `lib/parsers/csv.ts` with a minimal RFC 4180 reader.
- [ ] Failing tests for quoting: a quoted field containing a comma; a quoted field containing a newline; a doubled quote (`""`) as an escaped quote; a field with a quote in the middle of unquoted text.
- [ ] Implement each, confirming green between.
- [ ] Failing tests for the Dovetail shape: headers matched case-insensitively; extra columns ignored; header order irrelevant; a BOM at the start of the file stripped; CRLF line endings.
- [ ] Implement, confirm green.
- [ ] Failing tests for rejection: missing `Title` throws naming the headers actually found; missing `Content` likewise; a completely empty file throws.
- [ ] Implement, confirm green.
- [ ] Failing tests for per-row handling: a row with empty Content is skipped and reported; a row over 300,000 characters is skipped and reported; a row with an empty Title falls back to `Row N`.
- [ ] Implement, confirm green.
- [ ] Confirm `parseDovetailCsv` never throws on a single bad row, only on a structurally unusable file.

**Files:** create `lib/parsers/csv.ts`, `tests/parsers/csv.test.ts`, fixtures.

**Commit:** `feat(parsers): Dovetail CSV export reader`

---

## Task 6: The router

- [ ] Failing test: `.vtt` routes to the VTT parser even when MIME is an empty string.
- [ ] Rewrite `lib/parsers/index.ts` to switch on extension first, MIME second.
- [ ] Failing tests: `.csv` with MIME `application/vnd.ms-excel` is recognised as CSV and rejected from the single-transcript path with a message pointing at import; an unknown extension with a known MIME still routes by MIME; an unknown both throws the supported-types message.
- [ ] Implement, confirm green.
- [ ] Confirm `SUPPORTED_MIMES` gains the CSV types and that `parseTranscript` no longer throws "not implemented" for anything.

**Files:** modify `lib/parsers/index.ts`, `tests/parsers/index.test.ts`.

**Commit:** `feat(parsers): extension-first routing`

---

## Task 7: Migration

- [ ] Write `supabase/migrations/0002_import_mime_types.sql` updating the `transcripts` bucket's `allowed_mime_types` to add `text/csv` and `application/csv`.
- [ ] Make it idempotent, matching the `on conflict do update` style of `0001`.
- [ ] Note in the plan handoff that Josh runs `supabase db push`; do not run it from here.

**Files:** create `supabase/migrations/0002_import_mime_types.sql`.

**Commit:** `feat(db): allow csv uploads to the transcripts bucket`

---

## Task 8: Upload route, paste and the new types

- [ ] Replace `ENABLED_MIMES` with the full `SUPPORTED_MIMES` set, minus the CSV types which belong to the import route.
- [ ] Derive the storage extension from the validated type rather than hardcoding `.txt`, which the existing comment already flags as the intent.
- [ ] Add the paste path: when there is no `file` but there is a `text` field, validate length, write it to storage as `.txt` with `contentType: 'text/plain'`, and continue down the identical path.
- [ ] Use the supplied name for `filename`, defaulting to `Pasted transcript, <date>`.
- [ ] Confirm the paste path still spends a rate-limit token, still checks study ownership, and still cleans up the storage object if the insert fails.
- [ ] Verify by hand: upload a .vtt, a .srt, a .docx, and a paste, and confirm four rows reach `analyzed`.

**Files:** modify `app/api/studies/[studyId]/interviews/route.ts`.

**Commit:** `feat(upload): paste path and the three new file types`

---

## Task 9: The import route

- [ ] Add an `import` bucket to `lib/ratelimit.ts`, separate from `upload`.
- [ ] Create the route: auth, study ownership, rate limit, multipart parse, size check.
- [ ] Parse the CSV. On a structural failure, return 400 with the parser's message before anything is written.
- [ ] Enforce the 50-row cap after parsing and before any insert or storage write, returning the real row count in the message.
- [ ] Store the original CSV once at `{userId}/{studyId}/import-{importId}.csv`.
- [ ] Per row: derive an interview id, write `{userId}/{studyId}/{interviewId}.txt`, insert the row, enqueue the job.
- [ ] Make row failures partial rather than fatal: collect failures by title, keep successes, return both.
- [ ] Increment usage per row, not per request.
- [ ] Return `{ imported, skipped, failed, interviews }`.
- [ ] Verify by hand with a real Dovetail-shaped CSV of 3 rows, then a 60-row file to confirm the cap fires and writes nothing.

**Files:** create `app/api/studies/[studyId]/import/route.ts`, modify `lib/ratelimit.ts`.

**Commit:** `feat(import): capped Dovetail CSV import endpoint`

---

## Task 10: The three tabs

- [ ] Convert `upload-form.tsx` into a tabbed shell: `Upload`, `Paste`, `Import`. Tabs are local state, not URL state; this is a control, not a destination.
- [ ] Build `paste-form.tsx`: textarea, optional name field, submit. Exact strings from the spec's microcopy table. Inline validation for the under-50-words case rather than a toast.
- [ ] Build `import-form.tsx`: file input, client-side row count preview before submit, the over-cap message, the missing-headers message, and a result summary listing skipped rows by title.
- [ ] All spacing on the 8px scale. Reuse `.ku-press` and the house transition tokens.
- [ ] Verify at 375, 768, 1024 and 1440.
- [ ] Verify keyboard: tab order runs tabs, then the active panel's fields, then submit. Arrow keys move between tabs and the panel is labelled by its tab.

**Files:** modify `upload-form.tsx`, create `paste-form.tsx` and `import-form.tsx`.

**Commit:** `feat(upload): upload, paste and import tabs`

---

## Task 11: Verification

No completion claim without fresh output from each.

- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run build` — exit 0.
- [ ] Round trip per format: upload each of .txt, .vtt, .srt, .docx, plus a paste, and confirm each reaches `analyzed` with quotes that land on the right spans in the Day 7 transcript pane. This is the check that proves the parsers and the evidence spine agree.
- [ ] Rolling-caption round trip specifically: confirm the word count matches a hand count, since a dedup bug shows up as an inflated count before it shows up anywhere else.
- [ ] Import round trip: 3-row Dovetail CSV imports 3 interviews with correct titles; a 60-row file is refused and writes nothing.
- [ ] Confirm `supabase db push` applied `0002` and that a CSV upload is no longer rejected by the bucket.

---

## Commit sequence for Josh

Ten commits, in task order. Same rules as Day 7: clear `.git/index.lock` first, stage paths explicitly rather than `-A`, and run `npm install` after the `fflate` addition. `supabase db push` before testing the import route.
