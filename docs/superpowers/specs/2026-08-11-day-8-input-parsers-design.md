# Day 8 design: input parsers

**Status:** draft, awaiting Josh's approval 2026-08-11
**Author:** Claude + Josh
**Ships:** Feature 2.3 from the Knight UX feature expansion brief
**Skills applied:** superpowers, ux-microcopy, good-writing, spacing-system

## Goal

Four ways to get a transcript in, where today there is one.

The upload route accepts `text/plain` and nothing else. `SUPPORTED_MIMES` already lists vtt, srt and docx, `parseTranscript` already throws "not implemented (Day 2)" for each, and `ENABLED_MIMES` is a one-element set that gates them all off. The storage bucket's `allowed_mime_types` was written for the full set on day one. The scaffolding has been sitting there since Day 2 waiting for the parsers.

Two of the four are ordinary catch-up. The other two are the reason this moved up the list.

**Paste.** No repository vendor documents a paste-raw-text path. On a $19 tool aimed at solo researchers, being the only one where you can drop in a transcript without first saving it as a file is a small, real differentiator, and it is the cheapest thing in this spec.

**CSV, in Dovetail's exact export shape.** Dovetail killed its self-serve paid tier: `dovetail.com/pricing` now shows Free and Enterprise only, Free is one project and one channel, and Vendr puts the median annual contract at $21,600. Every Dovetail user who needs a second project is now being quoted Enterprise. Accepting their documented export format, UTF-8 with `Title` and `Content` header columns, semicolon-separated multi-select, is the difference between "we support CSV" and "import your Dovetail export." That is the highest-signal finding in the whole brief and it expires as competitors notice it.

## Hypothesis

After Day 8 ships:

1. I can paste a transcript straight from a doc into a text area and have it analysing in under ten seconds, without saving a file first.
2. I can drop a Dovetail CSV export in and get one interview per row, correctly titled, without editing the file.
3. I can upload a Zoom or Descript VTT and read it back as speaker-labelled prose rather than a wall of timecodes.

3+/5 on each, same dogfood bar as Days 2 through 7.

## Architecture

### The parsers

Every single-transcript parser keeps the existing contract, so the router is the only thing that grows:

```ts
export interface ParseResult { text: string; wordCount: number }
```

**`lib/parsers/cues.ts`**, shared by VTT and SRT because both are the same thing in different clothing: a list of cues with a time range, optional speaker and text. One pure function turns cues into prose.

```ts
export interface Cue { speaker: string | null; text: string }
export function cuesToProse(cues: Cue[]): string
```

Consecutive cues from the same speaker merge into one paragraph. A speaker change starts a new block. Files with no speaker information produce unlabelled paragraphs merged on a cue-gap heuristic rather than one paragraph per cue, because one cue per paragraph would give the evidence spine hundreds of two-word blocks.

The non-obvious part is deduplication. Auto-generated captions from YouTube, Zoom and Teams use rolling cues, where each cue repeats the tail of the previous one so the text scrolls. Naive concatenation triples the transcript and corrupts every word count and character offset downstream. `cuesToProse` trims the longest overlap between the end of the accumulated text and the start of the incoming cue before appending.

**`lib/parsers/vtt.ts`** strips the `WEBVTT` header and any `NOTE`, `STYLE` or `REGION` blocks, reads `<v Speaker>` voice tags for attribution, and drops cue identifiers and timestamps.

**`lib/parsers/srt.ts`** drops the sequence number and timecode line, strips the `{\an8}` and `<i>` formatting SRT files carry, and reads the `Speaker:` prefix convention where present.

**`lib/parsers/docx.ts`** unzips `word/document.xml` and extracts text: `<w:t>` runs concatenated, `<w:p>` as a paragraph boundary, `<w:tab>` and `<w:br>` respected, XML entities decoded.

**`lib/parsers/csv.ts`** returns a different shape, because a CSV is not one transcript:

```ts
export interface ParsedInterview { title: string; text: string; wordCount: number }
export function parseDovetailCsv(buf: Buffer): ParsedInterview[]
```

RFC 4180 quoting handled properly: quoted fields containing commas, embedded newlines inside quotes, and doubled quotes as escapes. Header row matched case-insensitively for `Title` and `Content`. Dovetail's documented 300,000 character content limit is enforced per row.

### The docx dependency

`fflate`, not `mammoth`.

Measured rather than assumed: mammoth installs 970 files and 9.2MB, fflate installs 18 files and 852KB with zero dependencies. On a repo this slow to traverse, that gap is the difference between a dependency you notice and one you do not. Mammoth also converts to HTML, which would then have to be converted back to text, so the heavier option is doing more work to arrive somewhere further from where this needs to be.

fflate handles the zip container. The XML to text step is written here and unit tested, which is the part that actually decides whether paragraphs and speakers survive.

Hand-rolling the zip parsing was considered and rejected. It is roughly eighty lines of central-directory reading with sharp edges around data descriptors and stored-not-deflated entries, and a bug there produces a silently garbled transcript rather than an error.

### The routes

`POST /api/studies/:studyId/interviews` grows two new entry paths and keeps its 1:1 shape.

- `ENABLED_MIMES` expands to the full `SUPPORTED_MIMES` set.
- The storage extension stops being hardcoded `.txt` and is derived from the validated MIME type, which the existing code comments already flag as the intended behaviour.
- A `text` form field, with no `file`, is the paste path. The pasted string is written to storage as `.txt` with `contentType: 'text/plain'` and then follows the identical code path. `storage_path` is `not null` and the raw source stays the source of truth, so paste gets a real storage object rather than a special case threaded through the schema.

`POST /api/studies/:studyId/import` is new, and separate on purpose.

- Its own rate-limit bucket, so a CSV import cannot spend the ordinary upload allowance and vice versa.
- Hard cap of 50 rows. Over that, the request is refused with a message naming the actual row count. A 500-row file quietly fanning out to 500 Claude calls is the failure this endpoint exists to prevent.
- Each row becomes its own interview with its own derived `.txt` object in storage, so `storage_path` stays 1:1 and Day 7's evidence spine works on imported interviews with no changes at all.
- The original CSV is stored once under `{userId}/{studyId}/import-{importId}.csv` for provenance.
- Usage counts per row, not per request.
- Returns the created rows plus a count, rather than the single row the upload route returns.

### MIME versus extension

The current router trusts the MIME header and uses the extension as a tiebreaker. That inverts for the new types, because browsers are unreliable here in a specific and well-known way: `.csv` commonly arrives as `application/vnd.ms-excel`, `.srt` frequently arrives as an empty string, and `.vtt` varies by platform. Extension becomes the primary signal and MIME the tiebreaker, with the parser itself as the final check, since a file whose content does not parse as its claimed type gets rejected on content regardless of what either header said.

### Migration

`0002_import_mime_types.sql`, one statement: add `text/csv` and `application/csv` to the `transcripts` bucket's `allowed_mime_types`. The original migration whitelisted plain text, vtt, srt and docx, so CSV is the only genuinely new type. Derived per-row files are `text/plain` and already allowed.

### Files

**New**

- `lib/parsers/cues.ts`, `vtt.ts`, `srt.ts`, `docx.ts`, `csv.ts`
- `app/api/studies/[studyId]/import/route.ts`
- `app/studies/[studyId]/_components/paste-form.tsx`
- `app/studies/[studyId]/_components/import-form.tsx`
- `supabase/migrations/0002_import_mime_types.sql`
- `tests/parsers/cues.test.ts`, `vtt.test.ts`, `srt.test.ts`, `docx.test.ts`, `csv.test.ts`
- `tests/fixtures/` caption, docx and CSV samples, including a rolling-caption VTT and a real Dovetail-shaped CSV

**Modified**

- `lib/parsers/index.ts`: extension-first routing, the four new types wired in
- `app/api/studies/[studyId]/interviews/route.ts`: full `ENABLED_MIMES`, derived extension, paste path
- `app/studies/[studyId]/_components/upload-form.tsx`: three tabs
- `lib/ratelimit.ts`: an `import` bucket
- `package.json`: `fflate`

## Microcopy

| Surface | String |
|---|---|
| Input tabs | `Upload` / `Paste` / `Import` |
| Paste textarea placeholder | `Paste your transcript. Speaker labels like "Interviewer:" are kept.` |
| Paste name field | `Name this transcript`, optional, defaults to `Pasted transcript, 11 Aug` |
| Paste submit | `Analyze transcript` |
| Paste too short | `Transcripts need at least 50 words to analyze.` |
| Import drop zone | `Drop a CSV export. Dovetail exports work as-is.` |
| Import preview | `12 interviews found. Titles come from the Title column.` |
| Import submit | `Import 12 interviews` |
| Import over cap | `That file has 340 rows and the limit is 50 per import. Split it and import in batches.` |
| CSV missing headers | `This CSV needs Title and Content columns. Found: Name, Notes, Date.` |
| Caption file with no cues | `Couldn't find any captions in this file.` |
| docx unreadable | `Couldn't read this .docx. If it's password protected, remove the protection and try again.` |
| Unsupported type | `Throughline reads .txt, .vtt, .srt, .docx and .csv files.` |

The import-over-cap string names the real number rather than repeating the limit, because a researcher with a 340-row export needs to know how many batches that is, and a message that only says "too many rows" makes them count.

## Decisions locked

1. **CSV goes to a separate capped import endpoint, confirmed by Josh.** Own rate-limit bucket, 50 rows, per-row usage counting, one derived `.txt` per row, original CSV kept for provenance.

2. **Captions become speaker-labelled prose with timestamps dropped, confirmed by Josh.** Merged by speaker, deduplicated against rolling captions, unlabelled fallback when the file has no speaker data. The time reference is a real loss; a cue-to-character-offset index is v1.1 and would let a quote resolve back to a timestamp if audio ever lands.

3. **Paste writes a real storage object.** `storage_path` is `not null`, and more importantly the raw source being the source of truth is what makes re-analysis and export honest later. A synthetic `.txt` costs nothing and avoids a nullable column and a branch in every consumer.

4. **fflate over mammoth for docx.** 18 files against 970, measured. The XML-to-text step is written and tested here rather than delegated to an HTML pipeline whose output would need converting back.

5. **Extension beats MIME for the new types.** Browsers send `application/vnd.ms-excel` for `.csv` and often an empty string for `.srt`. The parser is the final authority either way.

6. **Rolling-caption deduplication is in scope, not a nice-to-have.** Auto-generated captions are the single most common caption source and naive concatenation silently triples the transcript. Every character offset in the evidence spine depends on this being right.

7. **No change to the analysis pipeline.** Every parser produces the same `transcript_text` shape that `validateAndPrune` and `segmentTranscript` already handle. Day 8 adds inputs and touches nothing downstream.

## Failure modes

| Failure | Detection | Behaviour |
|---|---|---|
| CSV missing Title or Content headers | Header scan before parsing | Rejected, message naming the headers actually found |
| CSV over 50 rows | Row count after parse, before any insert | Rejected with the real count, nothing written, no rate-limit token spent |
| CSV row over 300,000 chars | Per-row check | That row skipped, named in the response, the rest import |
| CSV row with empty Content | Per-row check | Skipped and counted, not an error |
| Partial import failure midway | Per-row insert result | Rows that succeeded stay, failures listed by title. Not all-or-nothing, so a single bad row cannot discard 49 good ones |
| Rolling captions | Overlap trim in `cuesToProse` | Deduplicated, with the trim covered by a fixture built from real YouTube-style output |
| VTT or SRT with zero cues | Parser | Rejected before storage |
| docx that is not a zip, or password protected | fflate throws | Rejected with the protection-specific message |
| docx with no `word/document.xml` | Entry lookup | Rejected as unreadable |
| Extension and MIME disagree | Router prefers extension | Parser decides; content that does not parse is rejected |
| Paste under 50 words | Existing `parseTxt` guard | Existing message, surfaced inline rather than as a toast |

## Out of scope

- Timestamp preservation and audio jump-back. v1.1, and the reason decision 2 records what was given up.
- Import formats other than Dovetail's CSV shape. Condens, Aurelius and Reduct exports are their own work, and Dovetail is where the displaced users are.
- Async or queued import with progress. The 50-row cap keeps a synchronous import inside a normal request; queued import is the answer if the cap ever rises.
- PDF, RTF, and audio or video transcription.
- Speaker normalisation across files, participant identity, diarization.
- Re-parsing already-uploaded interviews under the new parsers.
