/**
 * The evidence payload shared across Knight UX.
 *
 * `EvidenceRef` is the object every citation in the suite serializes. It is
 * declared here rather than inside a component because three planned consumers
 * all need the identical shape, and they need to build a link to the source
 * span without a second round trip:
 *
 *   - Throughline 2.4, cross-study query, returns a list of these as its answer
 *     citations.
 *   - Throughline 2.5, the MCP surface and the "send to Persona Builder"
 *     handoff, ships these as its tool output.
 *   - Persona Builder 1.1 renders one citation chip per attribute from these,
 *     and the chip's href is built from study_id, interview_id and quote_index.
 *
 * Nothing in Day 7 reads the extra fields. Do not delete it as unused.
 */

/** A quote as stored in `interview_analyses.quotes_json`. */
export interface Quote {
  text: string;
  theme: string;
  /** Character offsets into `interviews.transcript_text`. */
  char_start: number;
  char_end: number;
}

/** A theme as stored in `interview_analyses.themes_json`. */
export interface Theme {
  name: string;
  description: string;
}

export interface EvidenceRef {
  study_id: string;
  interview_id: string;
  /** Index into that interview's `quotes_json`. Addresses the quote. */
  quote_index: number;
  char_start: number;
  char_end: number;
  text: string;
  theme: string;
  interview_filename: string;
  participant_label: string | null;
}

/** The URL that opens an interview scrolled to and focused on one quote. */
export function evidenceHref(ref: Pick<EvidenceRef, 'study_id' | 'interview_id' | 'quote_index'>): string {
  return `/studies/${ref.study_id}/interviews/${ref.interview_id}?q=${ref.quote_index}`;
}
