# Day 4 design: aggregate cross-study synthesis

**Status:** approved 2026-06-02
**Author:** Claude + Josh
**Replaces:** `lib/anthropic/synthesize.ts` Day 0 stub

## Goal

Merge per-interview themes into deduplicated cross-study themes the moment a researcher has enough data (3+ interviews). The aggregate appears as a second tab on the study page so it's discoverable without searching for it.

## Hypothesis

After uploading the 3rd interview to a study, the aggregate tab shows themes that:

1. **Dedup correctly:** themes that mean the same thing across interviews collapse into one aggregate theme with the correct frequency count.
2. **Preserve grounding:** every aggregate theme links back to at least one per-interview source theme.
3. **Feel different from any single interview:** the aggregate is meaningfully more than the union of per-interview themes.

3+/5 across all three on dogfood. Same rating bar as Day 3.

## Architecture

```
Day 3 analyze flow completes (interview status = analyzed)
  ↓
analyze handler counts analyzed interviews for this study:
  - If count >= 3: enqueue synthesize-study QStash job (dedup key = studyId)
  ↓
New job: POST /api/jobs/synthesize-study
  ↓
synthesizeStudy(studyId):
  1. Fetch all analyzed interview_analyses for the study.
     Input shape: array of { interview_id, themes: [{name, description}],
     sentiment, summary }. No quote text (cost + dedup quality trade-off
     in favor of cost; quote drill-down ships Day 5).
  2. Build user message + system prompt.
  3. Call Anthropic via withRetry, forcing the synthesize-study tool.
  4. Zod-parse against studyThemesSchema.
  5. Strip em/en dashes from aggregate theme names + descriptions (reuse
     text-normalize helper extracted from validate-quotes).
  6. Resolve source_quote_refs: the model returns aggregate themes plus
     a list of source-theme names per interview. Server post-process
     looks up matching per-interview themes, picks the first quote of
     each as the canonical ref. Drops aggregate themes that resolve to
     zero refs (loud failure if all themes orphan).
  7. Upsert into study_themes (UNIQUE on study_id, full row replace).
  ↓
/studies/[id] becomes tabbed: Interviews | Aggregate
Aggregate tab reads study_themes, renders theme cards with frequency badge
```

## Key decisions locked (2026-06-02)

1. **Trigger:** from inside the analyze job handler, post-success, when analyzed-interview count for the study reaches 3 or more. QStash dedup key on `studyId` so concurrent runs collapse.
2. **Input shape:** per-interview themes + sentiment + summary. No quote text in the prompt. Cost target $0.008 to $0.02 per run.
3. **Model:** `claude-sonnet-4-6` (same env var `ANTHROPIC_MODEL`). Haiku swap is a v1.1 cost lever.
4. **Output mechanism:** tool use with single tool `record_study_synthesis`, mirroring `studyThemesSchema`.
5. **Idempotency:** `study_themes` UNIQUE on `study_id`. Always upsert, never append.
6. **Em-dash rule:** same two-layer enforcement as Day 3. System prompt forbids; post-process strips. Verbatim quote text not applicable here since aggregates don't carry quote text in this v1.
7. **Frequency calculation:** asked of the model, validated server-side against the actual count of source-interview matches.

## Failure modes

| Failure | Detection | Behavior |
|---|---|---|
| <3 analyzed interviews at job time | Count check at top of handler | Skip, log, 200 (QStash doesn't retry) |
| Anthropic 5xx / network | withRetry | One retry, then mark synthesis_status='failed' on the study row |
| Anthropic 400 / bad format | InvalidAnalysisFormatError | Mark failed, no retry |
| Schema validation fails | Zod | Mark failed |
| All aggregate themes have zero resolved source refs | Server post-process | Mark failed with `Synthesis returned no grounded themes.` |
| Concurrent enqueues for same study | QStash dedup key on studyId | Later run wins, upsert idempotent |

## Cost model

Per typical study (10 interviews, ~5 themes + 80-char description each = ~50 theme objects = ~4k tokens in, plus system prompt + tool schema = ~6k input tokens): $0.018 in + ~$0.010 out = **~$0.03 per synthesis run**. Auto-rerun on every upload past the 3rd means a 25-interview study triggers 22 runs = ~$0.66 over the study's life. Within $19 ARPU budget.

## Out of scope (Day 4)

- Drill-down UI showing source quotes per aggregate theme (Day 5)
- Manual rerun button (Day 5 or v1.1)
- Inline theme editing on aggregate themes (Day 5)
- Multi-language synthesis (v1 cut)
- Cross-study comparison (v2)
- Streaming aggregate updates to the client (v2)

## Dogfood plan

Three synthetic transcripts (existing fixture + two new) with overlapping but distinct themes so the dedup has real variance to work with. Upload all three to one study, wait for synthesis, evaluate against the 3-criteria hypothesis.
