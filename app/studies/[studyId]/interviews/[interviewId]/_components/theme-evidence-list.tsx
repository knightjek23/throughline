'use client';

/**
 * The analysis half of the evidence spine.
 *
 * Same theme cards the interview page has always shown, with two changes: each
 * quote is a button that focuses its span in the transcript, and a quote whose
 * stored offsets no longer match the transcript says so instead of pretending
 * to be checkable.
 */

import { useEffect, useRef, useState } from 'react';
import type { Quote, Theme } from '@/lib/evidence/types';

interface Props {
  themes: Theme[];
  quotes: Quote[];
  unlocatable: number[];
  focusedQuote: number | null;
  focusNonce: number;
  onFocusQuote: (index: number) => void;
}

const FOCUS_RING_MS = 1000;

export function ThemeEvidenceList({
  themes,
  quotes,
  unlocatable,
  focusedQuote,
  focusNonce,
  onFocusQuote,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const [ringOn, setRingOn] = useState(false);
  const unlocatableSet = new Set(unlocatable);

  useEffect(() => {
    if (focusedQuote === null) return;
    const target = listRef.current?.querySelector<HTMLElement>(`[data-quote="${focusedQuote}"]`);
    if (!target) return;

    const box = target.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    }

    setRingOn(true);
    const timer = window.setTimeout(() => setRingOn(false), FOCUS_RING_MS);
    return () => window.clearTimeout(timer);
  }, [focusedQuote, focusNonce]);

  return (
    <section>
      <h2 className="t-eyebrow text-[var(--color-text-secondary)]">Themes ({themes.length})</h2>

      <ul ref={listRef} className="mt-4 space-y-4">
        {themes.map((theme, themeIndex) => {
          // Global quote indices, so a click addresses the same quote the
          // transcript pane and the ?q deep link do.
          const indices = quotes
            .map((quote, index) => ({ quote, index }))
            .filter(({ quote }) => quote.theme === theme.name)
            .map(({ index }) => index);

          return (
            <li
              key={`${theme.name}-${themeIndex}`}
              className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="t-display-3 text-[var(--color-text-primary)]">{theme.name}</h3>
                <span className="t-code ku-num shrink-0 text-[var(--color-text-tertiary)]">
                  {indices.length} {indices.length === 1 ? 'quote' : 'quotes'}
                </span>
              </div>

              <p className="t-body-m mt-4 text-[var(--color-text-secondary)]">{theme.description}</p>

              {indices.length > 0 ? (
                <ul className="mt-4 space-y-4 border-t border-[var(--color-border-subtle)] pt-4">
                  {indices.map((index) => {
                    const quote = quotes[index];
                    const missing = unlocatableSet.has(index);
                    const focused = ringOn && focusedQuote === index;

                    if (missing) {
                      return (
                        <li key={index} data-quote={index}>
                          <p className="t-italic-stat border-l-2 border-[var(--color-border-strong)] pl-4 text-[var(--color-text-secondary)]">
                            &ldquo;{quote.text}&rdquo;
                          </p>
                          <p
                            className="t-code mt-2 pl-4 text-[var(--color-text-tertiary)]"
                            title="The quote text no longer matches the transcript, so highlighting it could point at the wrong sentence."
                          >
                            Couldn&rsquo;t locate this quote in the transcript.
                          </p>
                        </li>
                      );
                    }

                    return (
                      <li key={index}>
                        <button
                          type="button"
                          data-quote={index}
                          data-focused={focused ? 'true' : undefined}
                          onClick={() => onFocusQuote(index)}
                          className="evidence-quote t-italic-stat block w-full border-l-2 border-[var(--color-accent)] pl-4 text-left text-[var(--color-text-primary)]"
                        >
                          &ldquo;{quote.text}&rdquo;
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
