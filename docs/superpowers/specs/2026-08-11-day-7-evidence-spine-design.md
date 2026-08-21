# Day 7 design: the evidence spine

**Status:** revision 2, awaiting Josh's approval 2026-08-11
**Author:** Claude + Josh
**Ships:** Feature 2.1 from the Knight UX feature expansion brief
**Skills applied:** superpowers, ui-ux-pro-max, ux-microcopy, ai-transparency-patterns, good-writing, spacing-system

## Goal

Click any claim, land on the sentence. Select any passage, see which themes claim it, or see that nothing does.

`quotes_json` has carried `char_start` and `char_end` since Day 3 and nothing reads them. The interview detail page never selects `transcript_text`, so the transcript has never been rendered. The Day 5 spec parked this as v2. It moves to the front because Persona Builder's grounding flagship cannot be built until it exists, and because the analysis pipeline currently has no persistent record a researcher can audit after the fact.

That second reason is the one worth naming properly. Every AI step in Throughline is ephemeral: the model reads a transcript once, writes themes and quotes, and from then on the user sees conclusions with no way to check them. A researcher who doubts one theme has to trust it or re-read the transcript by hand, and the second option is the whole job they bought the tool to avoid. The evidence spine is the audit trail for the analysis, and audit trails are the pattern that matters most in tools where a disputed output otherwise gets thrown away and redone manually.

Three pieces:

1. Render the transcript with every validated quote highlighted in place.
2. Wire it both directions, including arbitrary user selections.
3. Make a span addressable by URL, so aggregate themes and later Persona Builder citations link to a sentence rather than a page.

No migration. Every field this needs already exists.

## Hypothesis

After Day 7 ships:

1. Reading a theme, I click one of its quotes and the transcript lands on that sentence in context, highlighted, without losing my place in the theme list.
2. Reading a paragraph that looks important, I can tell in one interaction whether the analysis picked it up, including when the answer is no.
3. From an aggregate theme's drill-down, one click puts me on the exact sentence in the source interview.

3+/5 on each, same dogfood bar as Days 2 through 5.

## Architecture

### The pure core

`lib/evidence/segments.ts`. No React, no I/O, unit tested first.

```ts
export interface Segment {
  start: number;        // char offset into transcript_text
  end: number;
  text: string;
  quotes: number[];     // indices into quotes_json, empty means unquoted
}

export interface SegmentedTranscript {
  blocks: Segment[][];      // paragraph blocks, split on /\n{2,}/
  anchorFor: number[];      // quote index to its first covering segment
  unlocatable: number[];    // quote indices whose offsets do not match
  quotedBlockCount: number;
}

export function segmentTranscript(transcript: string, quotes: Quote[]): SegmentedTranscript;
```

Boundary sweep rather than nesting. Collect every `char_start` and `char_end`, sort unique, walk adjacent pairs, and record which quotes cover each resulting segment. Two overlapping quotes therefore produce a middle segment carrying both indices, and no quote gets dropped or visually buried inside another.

Every quote is re-verified before the sweep: `transcript.slice(char_start, char_end) === text`. `validateAndPrune` guarantees this at write time, so a mismatch means the data drifted, and drift must never produce a highlight at the wrong coordinates. Mismatched quotes go into `unlocatable` and are excluded.

### The render

`transcript-pane.tsx`, client component, receives `transcript: string` and `quotes: Quote[]` and memoizes `segmentTranscript`. Raw strings rather than pre-built segments, so the RSC payload carries the transcript once.

Each block is a `<p class="transcript-block whitespace-pre-wrap">`, which keeps single newlines inside a block intact and leaves `Speaker: text` transcripts readable. Unquoted segments are bare text nodes. Quoted segments are `<button>` elements styled as highlights, carrying `data-start` and `data-end` for the selection math. A button because the thing genuinely is interactive, and native semantics over div soup is the house rule Legible's own auditor prompt enforces. At most 20 quotes per interview, so at most 20 extra tab stops.

Long transcripts stay cheap without a virtualizer. A new utility in `globals.css`:

```css
.transcript-block { content-visibility: auto; contain-intrinsic-size: auto 4rem; }
```

The browser skips layout and paint for offscreen blocks. At the 500,000 char parser cap that is roughly 1,600 blocks, of which maybe 20 ever get painted.

### The wiring

`evidence-spine.tsx`, client component, owns one piece of state: `focusedQuote: number | null`. Both directions write it, both columns read it.

**Claim to source.** Theme quote list items become buttons. Click sets `focusedQuote`, the pane scrolls the anchor segment to `block: 'center'`, and the segment takes `data-focused`, which draws a 2px `--color-accent-ring` box-shadow ring over `--ku-dur-pop`, holds 1000ms, and fades out.

**Source to claim.** Click a highlight and the matching theme card scrolls into view in the left column with the same ring. A segment carrying more than one quote opens a small popover listing the claiming themes, and the click picks one.

**Arbitrary selection.** `selectionchange` on the pane, debounced 150ms. Selection start and end resolve to char offsets by reading `data-start` off the containing segment and adding the node offset. Overlap against `quotes` produces one of two cards, positioned above the selection. This is the half of the promise that makes the tool honest, and no competitor in the category ships it.

**Deep link.** `?q=<quoteIndex>` seeds `focusedQuote` on mount and scrolls once. Out-of-range or non-numeric values are ignored rather than thrown. Aggregate drill-down entries already hold `quote_index`, so passing it through `AggregateDrillDownEntry` and wrapping each quote in a `Link` to `/studies/[studyId]/interviews/[interviewId]?q=[quoteIndex]` is the whole change on that side.

**Reduced motion.** The global block in `globals.css` already keeps `box-shadow` in its allowed transition list, so the ring animates under reduced motion and nothing needs a variant. What does need handling is scroll: `matchMedia('(prefers-reduced-motion: reduce)')` picks `behavior: 'auto'` instead of `'smooth'`, because a 500ms smooth scroll across a long transcript is exactly the movement the preference exists to stop.

### The shared type

`lib/evidence/types.ts`:

```ts
export interface EvidenceRef {
  study_id: string;
  interview_id: string;
  quote_index: number;
  char_start: number;
  char_end: number;
  text: string;
  theme: string;
  interview_filename: string;
  participant_label: string | null;
}
```

Day 7 needs none of the extra fields. It is declared now because 2.4, 2.5 and Persona Builder 1.1 all serialize this same object, and the citation chip on the far side of that handoff needs to build a URL without a second round trip. One definition written down while the context is fresh.

### Files

New:

- `lib/evidence/segments.ts`
- `lib/evidence/types.ts`
- `app/studies/[studyId]/interviews/[interviewId]/_components/evidence-spine.tsx`
- `app/studies/[studyId]/interviews/[interviewId]/_components/transcript-pane.tsx`
- `app/studies/[studyId]/interviews/[interviewId]/_components/theme-evidence-list.tsx`
- `tests/evidence/segments.test.ts`

Modified:

- `app/studies/[studyId]/interviews/[interviewId]/page.tsx`: add `transcript_text` to the select, read `?q`, hand the analysed branch to `EvidenceSpine`, rewrite the in-progress copy
- `app/studies/[studyId]/_components/aggregate-themes.tsx`: carry `quote_index` through
- `app/studies/[studyId]/_components/aggregate-theme-list.tsx`: link each drill-down quote to its span
- `app/globals.css`: add `.transcript-block`

## Microcopy

Every string, so none of it gets improvised during implementation. Contractions on, no first-person plural, warmth dropping as stakes rise.

| Surface | String |
|---|---|
| Header stats | `20 quotes · 7 themes · 14 of 84 passages quoted` |
| Filter control | `All` / `Quoted only` |
| Collapsed unquoted run | `+142 words with no quote` |
| Highlight `aria-label` | `Quote supporting "Onboarding friction". Show in themes.` |
| Selection card, quoted | `Quoted in 2 themes` then each theme name as a button |
| Selection card, not quoted | `No quote covers this passage.` |
| Unlocatable quote note | `Couldn't locate this quote in the transcript.` |
| Unlocatable quote tooltip | `The quote text no longer matches the transcript, so highlighting it could point at the wrong sentence.` |
| Transcript absent | `No transcript stored for this interview.` |
| Empty analysis, queued | `Reading 4,182 words and pulling out themes. Usually 30 to 60 seconds.` |
| Empty analysis, processing | `Pulling themes and matching quotes back to the transcript.` |

That last pair replaces a string that is currently wrong, not just weak. The page says "Refresh in a moment" and has auto-polled since Day 5, so it tells the user to do something the product already does. Both new lines name the real work and the real constraint instead of the system's process, which is what makes a wait read as progress rather than a stall.

`No quote covers this passage.` stays flat on purpose. A researcher reading it is mid-judgment about whether to trust the analysis, and a friendly line there would read as the product not taking the question seriously.

## Decisions locked

1. **Two-column split at `lg`, confirmed by Josh.** Analysis left, transcript right, right column sticky with its own scroll at `max-h-[calc(100vh-4rem)]`. Below `lg` it stacks with the transcript second. `max-w-3xl` becomes `max-w-6xl` on this page only, and every other page keeps the editorial single column.

   Rejected: a right-hand drawer. It preserves `max-w-3xl` everywhere and reuses `--ku-ease-drawer`, but the selection-to-theme direction needs both columns visible, and a drawer over the theme list defeats wiring it both ways.

2. **The split engages only on the `analyzed` branch.** `queued`, `processing` and `failed` have no `quotes_json` to render, so they stay `max-w-3xl` exactly as they are today. Otherwise the page goes wide and shows an empty right half, which reads as a broken layout rather than a pending one.

3. **Overlaps flatten, they do not nest.** Boundary sweep, a segment carries a set of quote indices, a multi-quote segment gets a popover. Nested highlights are unreadable and the popover is fifteen lines.

4. **Unlocatable quotes are shown, not hidden.** The quote renders in the theme list with its text and the note above, and it is not clickable. This is the partial-success case: most of the analysis is sound, one citation cannot be verified, and collapsing that into either silence or a page-level error would misrepresent it. Silently dropping evidence is the exact failure this feature exists to prevent.

5. **The claimed-only filter ships in v1, confirmed by Josh.** Two states above the transcript, `All` and `Quoted only`. `Quoted only` collapses each run of unquoted text into a rule reading `+142 words with no quote`, expandable on click. It turns the transcript into an evidence digest. The inverse view, unquoted passages first, is v1.1.

6. **No coverage percentage.** Twenty quotes averaging 200 chars against a 60,000 char transcript is seven percent, a normal and healthy result that reads as a failing grade. The header counts passages instead, which is the unit a researcher actually thinks in.

7. **Focus is a ring, not a colour swap.** Rest highlight is `--color-accent-soft` fill plus a `--color-accent` bottom rule. Focus adds a `--color-accent-ring` ring. Two different colour treatments for rest and focus would read as two different kinds of highlight.

8. **`focusedQuote` is component state, not URL state.** `?q` seeds it on mount and is never rewritten as the user clicks around. A history stack full of quote indices is noise, and the deep link only has to work on arrival.

9. **Selection lookup ships in v1, confirmed by Josh.** Without it this is a citation viewer rather than an evidence spine.

10. **Spacing gets fixed in the files Day 7 touches, and nowhere else.** The three files in scope carry off-scale values: `p-5` and `space-y-3` and `mt-3` and `px-3` on the interview page, `mb-5` and `space-y-5` and `pt-5` and `mt-3` in the aggregate list. Each snaps to the nearest 8px step, chosen by relationship rather than rounded blindly. `pb-3` in `tab-bar.tsx` and the rest of the app are out of scope for this branch, because a flagship feature diff should not also be a suite-wide spacing sweep. Substitutions get reported in the commit.

11. **No dark mode work.** Throughline has no dark theme, only the light Cloud Dancer palette. The highlight needs no dark variant.

## Failure modes

| Failure | Detection | Behaviour |
|---|---|---|
| `transcript_text` is null | Server select | Single column, note in place of the pane, analysis renders as today |
| Quote offsets do not match | Re-verify in `segmentTranscript` | Quote goes to `unlocatable`, shown with a note, no highlight drawn at a guessed position |
| `char_end` past end of transcript | Same check | Same path |
| Two quotes with identical spans | Boundary sweep | One segment carrying both, popover on click |
| `?q` out of range or not a number | Parsed on the server | Ignored, page renders unfocused |
| Selection spans blocks or ends outside the pane | Offset resolution returns null | Card does not open, no error |
| Transcript at the 500,000 char cap | Measured before ship on the largest fixture | `content-visibility` per block keeps paint bounded |
| Aggregate `quote_index` no longer resolves | Existing Day 5 skip path | Entry omitted as today, and the link only renders for entries that resolved |

## Out of scope

- Editing or adding quotes by hand, and manually re-anchoring an unlocatable quote. v1.1.
- Unquoted-first review view. v1.1.
- Cross-study query and citation. That is 2.4, and it depends on this.
- MCP surface and the Persona Builder handoff. That is 2.5, and it serializes `EvidenceRef`.
- Speaker and turn parsing, diarization, timestamps. Blocks render what the parser produced.
- Consensus themes and confidence badges. That is 2.2.
- Input parsers beyond txt. That is 2.3.
- Spacing anywhere outside the three files this branch touches.

---

## Corrections made during implementation, 2026-08-11

Four changes to the locked decisions, each forced by a measurement rather than a preference.

**The highlight is an anchor, not a button.** Decision 3's render note said `<button>`, on the reasoning that native semantics beat div soup. Chromium computes `display: inline` on a button as `inline-block`, which was confirmed by reading the computed style off a real render, so a quote crossing a line break would have been pushed onto its own line instead of wrapping with the surrounding text. Quotes run up to 600 characters, so that is the common case, not the edge case. An anchor is inline, wraps correctly across three line boxes in the proof, and is keyboard focusable natively, so it needs no ARIA. The `href` is `?q=<index>`, which is the real address of that quote, so copy-link-to-quote now works for free. The click is intercepted, so decision 8 holds and focus stays local state.

**Every segment is an element, including unquoted ones.** The spec had unquoted runs rendering as bare text nodes. Selection offsets resolve by reading `data-start` off the nearest addressable ancestor, and a bare text node has none, so half of every selection would have failed to resolve. Unquoted segments now render as spans.

**The rest fill is a new token, not `--color-accent-soft`.** Measured against `--color-bg-surface`, accent-soft is 1.15:1, which on a paper card reads as no highlight at all. It was designed for chips on bone. Two new tokens: `--color-accent-wash #E4D1E1` for rest, at 9.67:1 with ink and 1.36:1 against paper, and `--color-accent-tint #D2B2CE` for hover, at 7.33:1 with ink and a 1.32:1 step up from rest.

**The focus ring is `--color-accent`, not `--color-accent-ring`.** Decision 7 named accent-ring. Against the fill the ring actually sits on, accent-ring measures 2.61:1 and fails WCAG 1.4.11's 3:1 for non-text contrast. `--color-accent` measures 5.61:1 on the fill and 6.44:1 on paper. Decision 7's intent, focus as a ring rather than a colour swap, is unchanged.

### Verification status

Run and passing:

- `vitest run tests/evidence` — 44 tests, 0 failures. Run against a mirror of `lib/evidence` in a Linux container, because the repo's `node_modules` holds Windows native rolldown bindings and the device bridge is a Linux VM.
- Scale case: 500,000 characters, 1,563 blocks, 20 quotes, segmented in 12ms.
- `tsc --noEmit --strict` on `lib/evidence/*` and the three components — 0 errors.
- Contrast, computed by relative luminance, every pair listed above.
- Rendered proof at 1440 and 375 from the real `app/globals.css`, with computed styles read back: mark `display: inline`, 3 line boxes on a wrapping quote, fill `rgb(228, 209, 225)`, rule `2px rgb(123, 74, 116)`, transition `background-color, box-shadow / 0.16s`, `content-visibility: auto` on blocks, grid `544px 544px` at 1440.

Not run, and needing Josh's own terminal:

- `npm test` in the repo. Requires `npm install` first, because `jsdom ^30.0.1` was added to devDependencies for the selection tests.
- `npm run lint`.
- `npm run build`. `page.tsx` and the two aggregate components import Supabase, Clerk and `next/*`, so none of them has been through a compiler yet.
- Real interaction: the scroll, the ring, the selection card, the `Quoted only` filter and the `?q` deep link have all been reasoned about and none has been clicked.

`app/globals.css.day7.bak` is a backup taken before the stylesheet was patched. The device bridge cannot delete files, so it needs removing by hand.

### jsdom removed, 2026-08-11

The first `npm test` run reported 13 files and 156 tests passing with one unhandled error: the forks worker for `tests/evidence/selection.test.ts` timed out before it responded, so that file contributed zero tests while the suite still read as green. A silently absent test file is worse than a failing one.

Root cause, measured rather than assumed: `require('jsdom')` against this repo does not complete in 45 seconds. Every other test file uses the default node environment and starts fine, so the fork mechanism is healthy; jsdom's module initialisation is what exceeds the worker-ready window. On a fast local disk the same require takes 1.4 seconds, which is the gap this repo's filesystem is adding.

happy-dom was considered and rejected. It requires four times faster on a fast disk, but it is 3,120 files against jsdom's 657, so on a filesystem that charges per file it is likely worse. Swapping one heavy DOM shim for a heavier one is a guess, not a fix.

Resolution: `jsdom` is removed from devDependencies, and `tests/evidence/selection.test.ts` now covers only the environment-free half of the module, `quotesOverlapping` and `themesFor`, at 39 tests across the two evidence test files with no environment and a 492ms run.

`resolveSelectionSpan` is verified in real Chromium instead, by `docs/superpowers/proof/shoot.cjs`. The harness generates its stylesheet from the repo's real `app/globals.css` and compiles the real `lib/evidence/selection.ts` on each run, so it cannot drift from what it claims to prove, and it asserts 19 checks: eight computed styles read off the page, and eleven selection cases including within a segment, across three segments, inside a mark, at an element-level boundary, collapsed, outside the pane, and with no selection at all. Real `Range` and `Selection`, not an approximation of them. All 19 pass.

Playwright is deliberately not a devDependency. Run the proof with `npm i -D playwright && npx playwright install chromium`, then `node docs/superpowers/proof/shoot.cjs`.

This is the second concrete symptom of the repo living inside OneDrive, after the `.git/index.lock` problem. The roadmap already recommends moving to something like `C:\Users\knigh\dev\Knight UX`. That move is the actual root-cause fix for both.

### Pre-existing lint failure fixed, 2026-08-11

The first `npm run lint` on this repo failed with one error, in Day 5 code rather than Day 7: `interview-list.tsx:64`, `setRows(initial)` inside an effect, caught by `react-hooks/set-state-in-effect`.

The effect existed to pull a fresh server render (from the upload form's `router.refresh`) into client state, because without it newly uploaded rows would not replace stale ones. That is a real requirement, so the fix is not to delete the effect but to stop needing one.

Server rows are now the source of truth and polled rows are an overlay:

```ts
const [polledRows, setPolledRows] = useState<InterviewRow[] | null>(null);
const [lastServerRows, setLastServerRows] = useState(initial);

if (initial !== lastServerRows) {
  setLastServerRows(initial);
  setPolledRows(null);
}

const rows = polledRows ?? initial;
```

Adjusting state during render is React's documented alternative to a syncing effect. React discards the in-progress render and retries with the new state before committing, so there is no second commit and no flash of stale rows. The identity comparison on `initial` is the same signal the old effect's dependency array already relied on, so behaviour is unchanged. Type-checks clean under `--strict`.

Fixed in this branch at Josh's call, as a separate commit so the Day 7 diff stays readable. `interview-list.tsx.day7.bak` is the pre-change backup and needs deleting by hand.
