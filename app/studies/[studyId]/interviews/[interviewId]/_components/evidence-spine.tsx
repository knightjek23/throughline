'use client';

/**
 * The two-column evidence layout, and the one piece of state that wires it.
 *
 * `focusedQuote` is the whole mechanism. The theme list writes it when a quote
 * is clicked, the transcript writes it when a highlight or a selection card is
 * clicked, and both read it to scroll and ring. `focusNonce` bumps on every
 * click so clicking the same quote twice replays the ring instead of doing
 * nothing.
 *
 * The split only exists on the analyzed branch of the interview page. A pending
 * or failed interview has no quotes to render, so it stays in the single
 * editorial column the rest of the app uses.
 */

import { useState } from 'react';
import { segmentTranscript } from '@/lib/evidence/segments';
import type { Quote, Theme } from '@/lib/evidence/types';
import { ThemeEvidenceList } from './theme-evidence-list';
import { TranscriptPane } from './transcript-pane';

interface Props {
  themes: Theme[];
  quotes: Quote[];
  transcript: string | null;
  initialQuote: number | null;
}

export function EvidenceSpine({ themes, quotes, transcript, initialQuote }: Props) {
  const [focus, setFocus] = useState<{ index: number | null; nonce: number }>({
    index: initialQuote,
    nonce: 0,
  });

  function focusQuote(index: number) {
    setFocus((previous) => ({ index, nonce: previous.nonce + 1 }));
  }

  // Computed here as well as in the pane so the theme list can mark unlocatable
  // quotes even when there is no transcript to render alongside them.
  const unlocatable = transcript
    ? segmentTranscript(transcript, quotes).unlocatable
    : quotes.map((_, index) => index);

  const list = (
    <ThemeEvidenceList
      themes={themes}
      quotes={quotes}
      unlocatable={transcript ? unlocatable : []}
      focusedQuote={focus.index}
      focusNonce={focus.nonce}
      onFocusQuote={focusQuote}
    />
  );

  if (!transcript) {
    return (
      <div className="mt-12">
        {list}
        <p className="t-body-m mt-8 rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] p-6 text-[var(--color-text-secondary)]">
          No transcript stored for this interview.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-12 grid grid-cols-1 gap-16 lg:grid-cols-2">
      {list}
      <div className="lg:sticky lg:top-8 lg:self-start">
        <TranscriptPane
          transcript={transcript}
          quotes={quotes}
          themeCount={themes.length}
          focusedQuote={focus.index}
          focusNonce={focus.nonce}
          onFocusQuote={focusQuote}
        />
      </div>
    </div>
  );
}
