/**
 * Server component that fetches aggregate themes for a study, resolves
 * each theme's source_quote_refs into rendered drill-down content
 * (filename + source theme name + quote text), and hands off to the
 * AggregateThemeList client component which manages expand state.
 *
 * Day 5 ships drill-down + re-synthesize. Theme editing + archiving
 * ship v1.1.
 */

import { createServerClient } from '@/lib/supabase/server';
import { SynthesizeCTA } from './synthesize-cta';
import {
  AggregateThemeList,
  type AggregateDrillDownEntry,
  type AggregateThemeRow,
} from './aggregate-theme-list';

const MIN_INTERVIEWS_FOR_SYNTHESIS = 3;

interface Props {
  studyId: string;
  analyzedInterviewCount: number;
}

interface SourceQuoteRef {
  interview_id: string;
  quote_index: number;
}

interface Quote {
  text: string;
  theme: string;
  char_start: number;
  char_end: number;
}

interface InterviewAnalysisJoin {
  id: string;
  filename: string;
  interview_analyses:
    | { quotes_json: unknown }
    | Array<{ quotes_json: unknown }>
    | null;
}

export async function AggregateThemes({ studyId, analyzedInterviewCount }: Props) {
  const supabase = await createServerClient();

  const { data: themes } = await supabase
    .from('study_themes')
    .select('id, name, description, frequency, source_quote_refs')
    .eq('study_id', studyId)
    .order('frequency', { ascending: false });

  const themeRows = themes ?? [];

  if (themeRows.length === 0) {
    return (
      <SynthesizeCTA
        studyId={studyId}
        analyzedInterviewCount={analyzedInterviewCount}
        minInterviews={MIN_INTERVIEWS_FOR_SYNTHESIS}
      />
    );
  }

  // Collect every interview referenced by any theme so we fetch each at most once.
  const interviewIds = new Set<string>();
  for (const theme of themeRows) {
    const refs = (theme.source_quote_refs as SourceQuoteRef[] | null) ?? [];
    for (const ref of refs) {
      interviewIds.add(ref.interview_id);
    }
  }

  // Fetch filenames + quotes_json for the referenced interviews in one round trip.
  const interviewLookup = new Map<string, { filename: string; quotes: Quote[] }>();
  if (interviewIds.size > 0) {
    const { data: interviewRows } = await supabase
      .from('interviews')
      .select(
        `
        id,
        filename,
        interview_analyses (
          quotes_json
        )
      `,
      )
      .in('id', Array.from(interviewIds));

    for (const row of (interviewRows ?? []) as InterviewAnalysisJoin[]) {
      const ia = Array.isArray(row.interview_analyses)
        ? row.interview_analyses[0]
        : row.interview_analyses;
      const quotes = (ia?.quotes_json as Quote[] | null) ?? [];
      interviewLookup.set(row.id, { filename: row.filename, quotes });
    }
  }

  // Resolve each theme's drill-down: per source_quote_ref, look up the
  // interview filename + the actual quote text and source theme name from
  // the per-interview analysis. Skip refs that can't be resolved (the
  // theme card still renders without that quote).
  const themesWithDrillDown: AggregateThemeRow[] = themeRows.map((theme) => {
    const refs = (theme.source_quote_refs as SourceQuoteRef[] | null) ?? [];
    const drillDown: AggregateDrillDownEntry[] = [];

    for (const ref of refs) {
      const interview = interviewLookup.get(ref.interview_id);
      if (!interview) continue;
      const quote = interview.quotes[ref.quote_index];
      if (!quote) continue;
      drillDown.push({
        interview_id: ref.interview_id,
        interview_filename: interview.filename,
        source_theme_name: quote.theme,
        quote: quote.text,
      });
    }

    return {
      id: theme.id,
      name: theme.name,
      description: theme.description ?? null,
      frequency: theme.frequency ?? null,
      drillDown,
    };
  });

  return <AggregateThemeList studyId={studyId} rows={themesWithDrillDown} />;
}
