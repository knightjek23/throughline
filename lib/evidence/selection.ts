/**
 * Resolving a user's text selection back to character offsets in the transcript.
 *
 * The transcript pane renders every segment as an element carrying `data-start`,
 * quoted and unquoted alike. That uniformity is the whole trick: any selection
 * boundary lands inside some element whose absolute offset is known, so the
 * character position is that element's `data-start` plus the text preceding the
 * boundary inside it.
 *
 * Rendering unquoted runs as bare text nodes would have been slightly leaner and
 * would have made half of every selection unresolvable, which is why they get a
 * span.
 *
 * Everything here returns null rather than guessing. A selection that leaves the
 * pane, or that starts in a node with no addressable ancestor, produces no card
 * instead of a card pointing at the wrong text.
 */

import type { Quote } from './types';

export interface SelectionSpan {
  start: number;
  end: number;
}

/**
 * Absolute character offset of a (node, offset) DOM position.
 *
 * For a text node, walks the text nodes inside the addressable ancestor to
 * accumulate the prefix length. For an element boundary, collapses to the
 * element's own start or end, since a child index is not a character position.
 */
function offsetOf(root: HTMLElement, node: Node, nodeOffset: number): number | null {
  const element = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
  const anchor = element?.closest<HTMLElement>('[data-start]') ?? null;
  if (!anchor || !root.contains(anchor)) return null;

  const base = Number(anchor.dataset.start);
  if (!Number.isFinite(base)) return null;

  if (node.nodeType !== 3) {
    return nodeOffset === 0 ? base : base + (anchor.textContent?.length ?? 0);
  }

  let prefix = 0;
  const walker = anchor.ownerDocument.createTreeWalker(anchor, 4 /* SHOW_TEXT */);
  let current: Node | null = walker.nextNode();
  while (current !== null) {
    if (current === node) return base + prefix + nodeOffset;
    prefix += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }

  return null;
}

export function resolveSelectionSpan(
  root: HTMLElement,
  selection: Selection | null,
): SelectionSpan | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const start = offsetOf(root, range.startContainer, range.startOffset);
  const end = offsetOf(root, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;

  return { start, end };
}

/** Quote indices overlapping the span at all, ascending. */
export function quotesOverlapping(span: SelectionSpan, quotes: Quote[]): number[] {
  const covering: number[] = [];
  quotes.forEach((quote, index) => {
    if (quote.char_start < span.end && quote.char_end > span.start) covering.push(index);
  });
  return covering;
}

/** Distinct theme names for a set of quote indices, in first-seen order. */
export function themesFor(quoteIndices: number[], quotes: Quote[]): string[] {
  const seen = new Set<string>();
  for (const index of quoteIndices) {
    const theme = quotes[index]?.theme;
    if (theme) seen.add(theme);
  }
  return Array.from(seen);
}
