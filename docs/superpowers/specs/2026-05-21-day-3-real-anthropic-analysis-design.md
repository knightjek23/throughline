# Day 3 design: real Anthropic analysis

**Status:** approved 2026-05-21
**Author:** Claude + Josh
**Replaces:** `lib/anthropic/analyze.ts` stub shipped on Day 2

## Goal

Replace the stub `analyzeInterview` with a real Anthropic Sonnet 4.6 call. Per-interview analysis produces themes, quotes, sentiment, and a summary grounded in the actual transcript. Quote text is verified against the transcript. Hallucinations get dropped. Orphan themes get pruned.

## Hypothesis

When Josh uploads a real research transcript and the analysis completes, the output is something he'd ship to a paying solo researcher. Rated 3+/5 against three checks:

1. At least one theme is genuinely useful and not generic
2. Every surviving quote is a real substring of the transcript
3. The analysis is biased toward the research question without being narrow

If under 3/5 on any check, prompt tuning before declaring Day 3 done.

## Architecture

One Anthropic call per interview. No chunking, no streaming. Tool use for structured output (most reliable mechanism for the nested theme + quote schema).

```
Job handler
  ↓
analyzeInterview(input)
  ↓
  1. Estimate token count (words * 1.3). If >40k, throw TooLongError.
  2. Build system prompt + user message (research question + transcript).
  3. Call Anthropic with tool definition matching interviewAnalysisSchema.
  4. Retry once on network or 5xx. Hard-fail on 400 or schema mismatch.
  5. Parse tool_use response. Zod-validate.
  6. For each quote:
       a. Check transcript.slice(char_start, char_end) === text
       b. If mismatch, indexOf(text) in transcript and fix positions
       c. If not found, drop the quote (log dropped_quote PostHog event)
  7. Prune themes that have zero surviving quotes (log dropped_theme event).
  8. If 0 themes remain, throw NoGroundedThemesError.
  9. Return validated analysis.
```

The QStash job handler stays as-is. It catches errors and writes `failure_reason` to the interviews row. New failure_reason strings:

- `"Transcript too long. Max 40k tokens, about 30k words."`
- `"Analysis API failed after retry."`
- `"Analysis returned invalid format."`
- `"Analysis returned no grounded themes."`

## Decisions locked (2026-05-21)

1. **Scope:** real analysis only. No chunking. No retry UI button. No interview detail page (Day 4).
2. **Research question role:** bias themes toward the RQ but allow 1-2 surprising off-RQ themes if the transcript signal is strong. Prompt explicitly invites this.
3. **Orphan themes:** drop them. Every shipping theme has at least one validated quote backing it.
4. **Model:** `claude-sonnet-4-6`.
5. **Output mechanism:** Anthropic tool use. Single tool `record_interview_analysis` matching `interviewAnalysisSchema`.
6. **Temperature:** 0 for determinism and testability.
7. **Max output tokens:** 4096 (covers 7 themes + 20 quotes comfortably).
8. **Token estimation:** `words * 1.3` heuristic. Not exact, but the 40k gate is a soft ceiling and being 10 percent off is fine since fail-loud is still the correct behavior at the boundary.
9. **Retry semantics:** retry once on network errors and 5xx only. No retry on 400 (would just fail again).

## Cost model

Sonnet 4.6 at $3 per MTok in, $15 per MTok out. A typical 10k-token transcript runs about $0.03 in + $0.06 out = **~$0.09 per analysis**. The roadmap's $0.008 estimate was for aggregate synthesis, not per-interview. Solo tier ceiling of 75 interviews per month is about $6.75 in COGS, well under the $19 ARPU.

## Failure modes handled

| Failure | Detection | User sees |
|---|---|---|
| Transcript >40k tokens | Token estimator before API call | Failed badge plus "Transcript too long..." reason |
| Anthropic 5xx or network | Retry once, then surface | Failed badge plus "Analysis API failed after retry." |
| Anthropic 400 (bad request) | No retry | Failed badge plus the API's error message, truncated to 200 chars |
| Schema validation fails | Zod throws | Failed badge plus "Analysis returned invalid format." |
| All quotes drop, all themes orphaned | Empty result post-validation | Failed badge plus "Analysis returned no grounded themes." |
| Some quotes drop, some themes survive | Normal path | Analyzed badge, dropped events logged to PostHog |

## Out of scope

- Chunking for >40k token transcripts (v1.1)
- Retry button in UI (Day 4 or v1.1)
- Aggregate cross-study synthesis (Day 5)
- Prompt caching and other Anthropic cost optimizations (v2)
- Streaming analysis to client (v2)
- Multi-language transcript support (v1 cut)

## Dogfood result (2026-06-02)

Hypothesis: rated 3+/5 across the three criteria.

**Actual:** 3 to 3.5 across all three (usefulness, grounding, RQ-bias-without-narrowing). Passes the bar but barely. The analysis is functional and ships, with prompt tuning queued as a v1.0 follow-up. Real-transcript dogfood will tell us whether the gap is the synthetic fixture or the prompt itself.

**What landed beyond original spec:** the read-only interview detail page (originally scoped for Day 4) was pulled forward so dogfood could happen in the actual UI instead of the SQL editor. A no-em-dash rule was added to both the system prompt and a post-process pass in `validate-quotes.ts` after the first dogfood revealed em dashes in generated content; see [[feedback-no-em-dash]].

**Known follow-ups:**

- Detail page does not auto-poll while interview is in queued or processing state. User has to refresh the page manually. Small polish for Day 4.
- Prompt could surface more specific theme names. Generic-leaning at 3/5 usefulness suggests room for sharpening.
- The 1 to 2 surprising off-RQ theme allowance may need stronger encouragement in the prompt.
