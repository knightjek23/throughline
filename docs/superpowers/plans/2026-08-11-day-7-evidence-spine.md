# Day 7 Evidence Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the transcript on the interview detail page and wire every quote to its exact character span in both directions, so any claim can be traced to a sentence and any sentence can be checked for claims.

**Architecture:** One pure segment builder turns `transcript_text` plus `quotes_json` into paragraph blocks of character-addressed segments. A client component owns a single `focusedQuote` index that both the theme column and the transcript column read and write. Aggregate drill-down links carry `quote_index` into a `?q=` deep link on the interview page.

**Tech Stack:** Next.js 16.2.4, React 19.2.4, Tailwind v4, Zod 4, vitest 4, Supabase JS.

**Spec:** `docs/superpowers/specs/2026-08-11-day-7-evidence-spine-design.md`, approved 2026-08-11.

---

## Git constraint, read before starting

Do not run `git` in this repo through the device bridge. The bridge cannot delete files, so every git call leaves a `.git/index.lock` it has no permission to unlink, which is how all four Knight UX repos ended up carrying stale locks. That rules out a worktree for this branch, so Phase 3 of superpowers is skipped deliberately rather than forgotten.

Consequence: all work lands on disk uncommitted. The branch, the commits and the push are Josh's, from his own terminal. Per-task commit messages are listed at the end of this plan so each task stays independently verifiable.

## File structure

**New**

| File | Responsibility |
|---|---|
| `lib/evidence/segments.ts` | Pure. Boundary-sweep a transcript into paragraph blocks of segments, each carrying the quote indices covering it. Re-verify quote offsets, report unlocatable ones. |
| `lib/evidence/types.ts` | The `EvidenceRef` shape that 2.4, 2.5 and Persona Builder 1.1 will all serialize. Types only, no logic. |
| `tests/evidence/segments.test.ts` | Unit tests for the sweep, written before the implementation. |
| `app/studies/[studyId]/interviews/[interviewId]/_components/transcript-pane.tsx` | Client. Renders blocks, highlight buttons, the `All` / `Quoted only` filter, collapsed unquoted runs, and the selection card. |
| `app/studies/[studyId]/interviews/[interviewId]/_components/theme-evidence-list.tsx` | Client. Themes with their quotes as buttons, plus the unlocatable-quote note. |
| `app/studies/[studyId]/interviews/[interviewId]/_components/evidence-spine.tsx` | Client. Owns `focusedQuote`, lays out the two columns, handles scroll and the focus ring. |

**Modified**

| File | Change |
|---|---|
| `app/studies/[studyId]/interviews/[interviewId]/page.tsx` | Add `transcript_text` to the interview select. Parse `?q`. Route the `analyzed` branch into `EvidenceSpine` at `max-w-6xl`, leave the other three branches at `max-w-3xl`. Replace the in-progress copy. Snap off-scale spacing. |
| `app/studies/[studyId]/_components/aggregate-themes.tsx` | Add `quote_index` to each resolved drill-down entry. |
| `app/studies/[studyId]/_components/aggregate-theme-list.tsx` | Wrap each drill-down quote in a `Link` to the span. Snap off-scale spacing. |
| `app/globals.css` | Add `.transcript-block` and the highlight styles. |

---

## Task 1: The pure segment builder

Everything else depends on this, and it is the only part with real algorithmic risk. Test first.

- [ ] Create `tests/evidence/segments.test.ts` with one failing test: a transcript with a single quote produces three segments (before, quoted, after), and the quoted one carries `[0]`.
- [ ] Run `npx vitest run tests/evidence` and confirm it fails because `lib/evidence/segments.ts` does not exist, not because of a typo in the test.
- [ ] Create `lib/evidence/segments.ts` with the minimum to pass: collect boundaries, sort unique, walk pairs, assign covering quote indices.
- [ ] Run `npx vitest run tests/evidence`, confirm green.
- [ ] Add a failing test for two overlapping quotes: the overlap segment carries both indices, in ascending order, and no quote is dropped.
- [ ] Implement, confirm green.
- [ ] Add a failing test for a quote whose `text` does not match `transcript.slice(char_start, char_end)`: it lands in `unlocatable`, no segment claims it, and the remaining quotes still segment correctly.
- [ ] Implement, confirm green.
- [ ] Add a failing test for `char_end` beyond `transcript.length`: same `unlocatable` path.
- [ ] Implement, confirm green.
- [ ] Add a failing test for paragraph blocks: a transcript with `\n\n` splits into two blocks, a quote spanning the break appears in both blocks' segments with correct offsets, and single `\n` inside a block does not split.
- [ ] Implement, confirm green.
- [ ] Add a failing test for `anchorFor`: each quote index maps to the index of the first segment covering it, and an unlocatable quote maps to `-1`.
- [ ] Implement, confirm green.
- [ ] Add a failing test for `quotedBlockCount`: counts blocks containing at least one quoted segment, not total blocks.
- [ ] Implement, confirm green.
- [ ] Add edge-case tests: empty quote array returns one segment per block with empty `quotes`; adjacent non-overlapping quotes do not produce a zero-length segment between them; two quotes with identical spans produce one segment carrying both.
- [ ] Implement, confirm green.
- [ ] Run `npx vitest run` for the whole suite and confirm nothing else broke.

**Files:** create `lib/evidence/segments.ts`, create `tests/evidence/segments.test.ts`.

**Commit:** `feat(evidence): pure transcript segment builder with offset verification`

---

## Task 2: The shared evidence type

- [ ] Create `lib/evidence/types.ts` exporting `EvidenceRef` exactly as specified, with a file comment naming its three future consumers so nobody deletes it as unused.
- [ ] Re-export the `Quote` shape used by `segments.ts` from the same module so components import one place rather than redeclaring the interface (it is currently redeclared in three files).
- [ ] Update `segments.ts` to import `Quote` from `types.ts`.
- [ ] Run `npx vitest run tests/evidence`, confirm still green.
- [ ] Run `npx tsc --noEmit` and confirm no type errors.

**Files:** create `lib/evidence/types.ts`, modify `lib/evidence/segments.ts`.

**Commit:** `feat(evidence): canonical EvidenceRef type for cross-app citations`

---

## Task 3: Styles

- [ ] In `app/globals.css`, add `.transcript-block { content-visibility: auto; contain-intrinsic-size: auto 4rem; }`.
- [ ] Add `.evidence-mark`: `--color-accent-soft` background, 2px solid `--color-accent` bottom border, 4px horizontal padding, `cursor: pointer`, `border-radius: 2px`, colour transition at `--ku-dur-hover`.
- [ ] Add `.evidence-mark:hover` at `--color-accent-ring` background, gated behind `@media (hover: hover) and (pointer: fine)` to match the house motion rules.
- [ ] Add `.evidence-mark:focus-visible` with a visible 2px `--color-accent` outline at 2px offset, because keyboard users tab through up to 20 of these.
- [ ] Add `.evidence-mark[data-focused="true"]` with a `box-shadow: 0 0 0 2px var(--color-accent-ring)` ring.
- [ ] Verify contrast: `--color-text-primary` `#2C2C2A` on `--color-accent-soft` `#F0E6EE` must clear 4.5:1. Compute it, do not assume.
- [ ] Verify the same text on the hover fill `--color-accent-ring` `#B57FAD` clears 4.5:1. If it does not, drop the hover to a lighter step rather than shipping a hover state that fails AA.

**Files:** modify `app/globals.css`.

**Commit:** `style(evidence): transcript block and highlight styles`

---

## Task 4: The transcript pane

- [ ] Create `transcript-pane.tsx` as a client component taking `transcript`, `quotes`, `focusedQuote`, `onFocusQuote`, and memoizing `segmentTranscript`.
- [ ] Render blocks as `<p class="transcript-block whitespace-pre-wrap">`, unquoted segments as text, quoted segments as `<button class="evidence-mark">` with `data-start`, `data-end`, `data-focused`, and the `aria-label` from the spec's microcopy table.
- [ ] Wire the click: single covering quote focuses it directly; multiple opens a popover listing claiming themes.
- [ ] Add the header stat line and the `All` / `Quoted only` filter, using the exact strings from the spec.
- [ ] Implement `Quoted only`: collapse each run of unquoted segments into a button reading `+N words with no quote`, expandable per run.
- [ ] Add the selection handler: `selectionchange` debounced 150ms, resolve offsets from `data-start` plus node offset, compute overlap, position the card above the selection.
- [ ] Render both selection card states with the exact strings, theme names clickable in the quoted case.
- [ ] Return null from the offset resolver when the selection leaves the pane or spans blocks, and confirm the card stays closed rather than erroring.
- [ ] Verify at 375, 768, 1024 and 1440 px.

**Files:** create `app/studies/[studyId]/interviews/[interviewId]/_components/transcript-pane.tsx`.

**Commit:** `feat(evidence): transcript pane with highlights, filter and selection lookup`

---

## Task 5: The theme evidence list

- [ ] Create `theme-evidence-list.tsx` as a client component taking `themes`, `quotes`, `unlocatable`, `focusedQuote`, `onFocusQuote`.
- [ ] Move the existing theme card markup over from `page.tsx` unchanged in appearance, then convert each quote from an `<li>` to a `<button>` that calls `onFocusQuote`.
- [ ] Render the focus ring on the card matching `focusedQuote`.
- [ ] Render unlocatable quotes with their text, the note string, and no click target. Attach the tooltip string.
- [ ] Snap the off-scale spacing carried over from `page.tsx`: `p-5` to `p-6`, `space-y-3` to `space-y-4`, `mt-3` to `mt-4`, `px-3` on the sentiment badge to `px-4`.
- [ ] Verify keyboard order: tabbing runs theme by theme, quote by quote, in reading order.

**Files:** create `app/studies/[studyId]/interviews/[interviewId]/_components/theme-evidence-list.tsx`.

**Commit:** `feat(evidence): theme list with clickable quotes and unlocatable notes`

---

## Task 6: The spine and the page

- [ ] Create `evidence-spine.tsx` owning `focusedQuote`, seeded from an `initialQuote` prop.
- [ ] Lay out the two columns: `lg:grid lg:grid-cols-2 lg:gap-16`, right column `lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto`, stacked below `lg`.
- [ ] Implement the scroll effect on `focusedQuote` change: find the anchor element by id, `scrollIntoView({ block: 'center', behavior })` where `behavior` comes from `matchMedia('(prefers-reduced-motion: reduce)')`.
- [ ] Implement the ring hold: set `data-focused`, clear it after 1000ms, and cancel the timer on unmount and on a new focus.
- [ ] Modify `page.tsx`: add `transcript_text` to the select, parse `?q` from `searchParams` (ignore out-of-range and non-numeric), render the `analyzed` branch inside `EvidenceSpine` at `max-w-6xl`, keep the other three branches at `max-w-3xl`.
- [ ] Handle `transcript_text` null: single column, note string in place of the pane.
- [ ] Replace the queued and processing copy with the two strings from the spec, interpolating the real word count.
- [ ] Snap remaining off-scale spacing in `page.tsx`.
- [ ] Verify: click a quote, transcript scrolls and rings. Click a highlight, theme card scrolls and rings. Load `?q=3` and confirm it lands focused.

**Files:** create `evidence-spine.tsx`, modify `page.tsx`.

**Commit:** `feat(evidence): two-way wiring and ?q deep link on interview detail`

---

## Task 7: Aggregate drill-down links out to the span

- [ ] In `aggregate-themes.tsx`, add `quote_index: ref.quote_index` to each `AggregateDrillDownEntry` it builds.
- [ ] In `aggregate-theme-list.tsx`, add `quote_index` to the interface and wrap each drill-down quote in a `Link` to `/studies/${studyId}/interviews/${entry.interview_id}?q=${entry.quote_index}`.
- [ ] Keep the existing serif-italic-with-accent-rule treatment; the link must not restyle the quote.
- [ ] Snap the off-scale spacing in this file: `mb-5` to `mb-6`, `space-y-5` to `space-y-6`, `pt-5` to `pt-6`, `mt-3` to `mt-4`, `px-3` to `px-4`.
- [ ] Verify: from the Aggregate tab, expand a theme, click a quote, land on the right sentence in the right interview.

**Files:** modify `app/studies/[studyId]/_components/aggregate-themes.tsx`, `app/studies/[studyId]/_components/aggregate-theme-list.tsx`.

**Commit:** `feat(evidence): aggregate drill-down links to the source span`

---

## Task 8: Verification

No completion claim without fresh output from each of these.

- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run build` — exit 0.
- [ ] Largest fixture check: build a 500,000 char transcript, render it, confirm the page stays interactive and paint stays bounded.
- [ ] Contrast: computed ratios for the highlight fill and the hover fill against `--color-text-primary`, both at or above 4.5:1.
- [ ] Reduced motion: confirm the scroll is instant and the ring still crossfades.
- [ ] Responsive: 375, 768, 1024, 1440.
- [ ] Rendered proof: screenshot the split view with a quote focused, and the `Quoted only` filter engaged.
- [ ] Spacing report: list every substitution made, per file.

---

## Commit sequence for Josh

Run from your own terminal, in `Dovetail Lite/throughline`. Clear any stale lock first with `rm -f .git/index.lock`. Note the accent and motion changes from earlier sessions are still uncommitted in this repo, so stage paths explicitly rather than using `-A`.

```
git checkout -b day-7-evidence-spine
git add docs/superpowers/specs/2026-08-11-day-7-evidence-spine-design.md docs/superpowers/plans/2026-08-11-day-7-evidence-spine.md
git commit -m "docs: day 7 evidence spine spec and plan"
```

Then one commit per task using the messages above, staging only that task's files. Two extra commits beyond the eight tasks:

```
fix(interviews): stop syncing server rows through an effect
```

for the pre-existing `react-hooks/set-state-in-effect` failure in `interview-list.tsx`, and

```
test(evidence): verify selection in real Chromium instead of jsdom
```

for the proof harness and the trimmed selection test. Delete `app/globals.css.day7.bak` and `app/studies/[studyId]/_components/interview-list.tsx.day7.bak` before staging; the bridge cannot remove them.
