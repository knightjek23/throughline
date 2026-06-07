/**
 * Server-side tab bar for the study detail page. Tabs are URL-driven
 * via `?tab=`, so each tab is deep-linkable and the page only fetches
 * data for the active tab.
 *
 * Styling matches the editorial Cloud Dancer aesthetic: mono uppercase
 * labels with an underline accent on active.
 */

import Link from 'next/link';

export type StudyTab = 'interviews' | 'aggregate';

interface Props {
  studyId: string;
  activeTab: StudyTab;
  interviewCount: number;
  aggregateThemeCount: number;
}

interface TabSpec {
  key: StudyTab;
  label: string;
  count: number;
}

export function TabBar({ studyId, activeTab, interviewCount, aggregateThemeCount }: Props) {
  const tabs: TabSpec[] = [
    { key: 'interviews', label: 'Interviews', count: interviewCount },
    { key: 'aggregate', label: 'Aggregate', count: aggregateThemeCount },
  ];

  return (
    <nav
      aria-label="Study sections"
      className="mt-10 flex gap-8 border-b border-[var(--color-border-default)]"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const href = `/studies/${studyId}${tab.key === 'interviews' ? '' : `?tab=${tab.key}`}`;
        return (
          <Link
            key={tab.key}
            href={href}
            className={`-mb-px flex items-baseline gap-2 border-b-2 pb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] transition-colors ${
              isActive
                ? 'border-[var(--color-accent)] text-[var(--color-text-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {tab.label}
            {tab.count > 0 ? (
              <span
                className={`font-mono text-xs ${
                  isActive
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-tertiary)]'
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
