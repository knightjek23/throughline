'use client';

/**
 * The transcript half of the evidence spine.
 *
 * Renders the transcript in paragraph blocks with every validated quote
 * highlighted in place, and answers two questions the researcher has while
 * reading it: which theme claims this sentence, and did the analysis miss
 * anything here.
 *
 * Every segment is an element carrying data-start, quoted or not, because
 * selection offsets are resolved from that attribute. See lib/evidence/selection.
 *
 * A highlight is an anchor, not a button, and that is deliberate. Chromium
 * computes `display: inline` on a button as `inline-block`, so a quote crossing
 * a line break would be pushed onto its own line instead of wrapping with the
 * surrounding text. Anchors are inline, wrap correctly, and are keyboard
 * focusable natively, so no ARIA is needed to make them operable. The href is
 * also honest: `?q=<index>` is the real address of that quote, which means
 * copy-link-to-quote works for free. The click is intercepted so focusing a
 * span stays local state rather than a navigation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { segmentTranscript, type Segment } from '@/lib/evidence/segments';
import type { Quote } from '@/lib/evidence/types';
import {
  quotesOverlapping,
  resolveSelectionSpan,
  themesFor,
  type SelectionSpan,
} from '@/lib/evidence/selection';

interface Props {
  transcript: string;
  quotes: Quote[];
  themeCount: number;
  focusedQuote: number | null;
  focusNonce: number;
  onFocusQuote: (index: number) => void;
}

type Filter = 'all' | 'quoted';

interface SelectionCard {
  top: number;
  left: number;
  quoteIndices: number[];
}

const FOCUS_RING_MS = 1000;
const SELECTION_DEBOUNCE_MS = 150;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Groups a block's segments into quoted singles and runs of unquoted text. */
function runsOf(segments: Segment[]): Array<{ quoted: boolean; segments: Segment[] }> {
  const runs: Array<{ quoted: boolean; segments: Segment[] }> = [];
  for (const segment of segments) {
    const quoted = segment.quotes.length > 0;
    const tail = runs[runs.length - 1];
    if (tail && tail.quoted === quoted) tail.segments.push(segment);
    else runs.push({ quoted, segments: [segment] });
  }
  return runs;
}

function isMostlyVisible(element: Element, container: Element | null): boolean {
  const box = element.getBoundingClientRect();
  if (container) {
    const frame = container.getBoundingClientRect();
    return box.top >= frame.top && box.bottom <= frame.bottom;
  }
  return box.top >= 0 && box.bottom <= window.innerHeight;
}

export function TranscriptPane({
  transcript,
  quotes,
  themeCount,
  focusedQuote,
  focusNonce,
  onFocusQuote,
}: Props) {
  const paneRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedRuns, setExpandedRuns] = useState<Set<number>>(new Set());
  const [card, setCard] = useState<SelectionCard | null>(null);
  const [ringOn, setRingOn] = useState(false);

  const segmented = useMemo(() => segmentTranscript(transcript, quotes), [transcript, quotes]);
  const locatableCount = quotes.length - segmented.unlocatable.length;

  // Scroll the focused quote into view, then hold a ring on it briefly.
  useEffect(() => {
    if (focusedQuote === null) return;
    const key = segmented.anchorFor[focusedQuote];
    if (key === undefined || key < 0) return;

    const pane = paneRef.current;
    const target = pane?.querySelector<HTMLElement>(`[data-key="${key}"]`);
    if (!pane || !target) return;

    // Expand any collapsed run holding the target, then scroll if it is off screen.
    if (!isMostlyVisible(target, pane.scrollHeight > pane.clientHeight ? pane : null)) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    }

    setRingOn(true);
    const timer = window.setTimeout(() => setRingOn(false), FOCUS_RING_MS);
    return () => window.clearTimeout(timer);
  }, [focusedQuote, focusNonce, segmented.anchorFor]);

  const readSelection = useCallback(() => {
    const pane = paneRef.current;
    if (!pane) return;

    const span: SelectionSpan | null = resolveSelectionSpan(pane, window.getSelection());
    if (!span) {
      setCard(null);
      return;
    }

    const range = window.getSelection()?.getRangeAt(0);
    if (!range) {
      setCard(null);
      return;
    }

    const box = range.getBoundingClientRect();
    const frame = pane.getBoundingClientRect();
    setCard({
      top: box.top - frame.top + pane.scrollTop,
      left: box.left - frame.left,
      quoteIndices: quotesOverlapping(span, quotes),
    });
  }, [quotes]);

  useEffect(() => {
    let timer = 0;
    function onSelectionChange() {
      window.clearTimeout(timer);
      timer = window.setTimeout(readSelection, SELECTION_DEBOUNCE_MS);
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [readSelection]);

  function toggleRun(key: number) {
    setExpandedRuns((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderQuoted(segment: Segment) {
    const primary = segment.quotes[0];
    const themes = themesFor(segment.quotes, quotes);
    const focused = focusedQuote !== null && ringOn && segment.quotes.includes(focusedQuote);

    return (
      <a
        key={segment.key}
        href={`?q=${primary}`}
        data-key={segment.key}
        data-start={segment.start}
        data-end={segment.end}
        data-focused={focused ? 'true' : undefined}
        className="evidence-mark"
        aria-label={`Quote supporting "${themes.join('", "')}". Show in themes.`}
        onClick={(event) => {
          event.preventDefault();
          onFocusQuote(primary);
        }}
      >
        {segment.text}
      </a>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="t-eyebrow text-[var(--color-text-secondary)]">Transcript</h2>
        <div className="flex items-center gap-2">
          {(['all', 'quoted'] as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className={`t-eyebrow ku-press rounded-md px-4 py-2 transition-colors duration-[var(--ku-dur-hover)] ${
                filter === option
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {option === 'all' ? 'All' : 'Quoted only'}
            </button>
          ))}
        </div>
      </div>

      <p className="t-code ku-num mt-4 text-[var(--color-text-tertiary)]">
        {locatableCount} {locatableCount === 1 ? 'quote' : 'quotes'} · {themeCount}{' '}
        {themeCount === 1 ? 'theme' : 'themes'} · {segmented.quotedBlockCount} of{' '}
        {segmented.blocks.length} passages quoted
      </p>

      <div
        ref={paneRef}
        className="relative mt-6 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6 lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto"
      >
        {segmented.blocks.map((segments, blockIndex) => {
          const runs = runsOf(segments);
          const visible = runs.filter(
            (run) => filter === 'all' || run.quoted || expandedRuns.has(run.segments[0].key),
          );
          if (filter === 'quoted' && visible.length === 0) return null;

          return (
            <p
              key={blockIndex}
              className="transcript-block t-body-m mt-4 whitespace-pre-wrap text-[var(--color-text-primary)] first:mt-0"
            >
              {runs.map((run) => {
                if (run.quoted) return run.segments.map(renderQuoted);

                const runKey = run.segments[0].key;
                const text = run.segments.map((segment) => segment.text).join('');

                if (filter === 'quoted' && !expandedRuns.has(runKey)) {
                  return (
                    <button
                      key={runKey}
                      type="button"
                      onClick={() => toggleRun(runKey)}
                      className="t-code ku-press mx-2 rounded-md bg-[var(--color-bg-subtle)] px-4 py-1 text-[var(--color-text-secondary)] transition-colors duration-[var(--ku-dur-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      +{wordCount(text)} words with no quote
                    </button>
                  );
                }

                return run.segments.map((segment) => (
                  <span key={segment.key} data-key={segment.key} data-start={segment.start} data-end={segment.end}>
                    {segment.text}
                  </span>
                ));
              })}
            </p>
          );
        })}

        {card ? (
          <div
            className="pointer-events-auto absolute z-10 -translate-y-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] p-4 shadow-lg"
            style={{ top: card.top - 8, left: card.left }}
            role="status"
          >
            {card.quoteIndices.length === 0 ? (
              <p className="t-body-m text-[var(--color-text-primary)]">No quote covers this passage.</p>
            ) : (
              <>
                <p className="t-eyebrow text-[var(--color-text-secondary)]">
                  Quoted in {themesFor(card.quoteIndices, quotes).length}{' '}
                  {themesFor(card.quoteIndices, quotes).length === 1 ? 'theme' : 'themes'}
                </p>
                <ul className="mt-2 space-y-2">
                  {card.quoteIndices.map((index) => (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => {
                          onFocusQuote(index);
                          setCard(null);
                        }}
                        className="t-body-m text-left text-[var(--color-accent)] underline decoration-[var(--color-accent-ring)] underline-offset-4"
                      >
                        {quotes[index]?.theme}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
