import type { AiSummary } from '@/stellog/summary-text';

export type SummaryProject = {
  name: string;
  pageviews: number;
  visitors: number;
  requests: number;
  errors: number;
  errorRate: string;
  p95: number | null;
  pageviewsTrend: string;
  visitorsTrend: string;
  requestsTrend: string;
  pageviewsPrevious: number;
  visitorsPrevious: number;
  requestsPrevious: number;
};

export type SummaryLedger = {
  activity: string;
  network: string;
  asset: string;
  result: string;
};

export type SummaryInput = {
  scope: string;
  period: string;
  totals?: SummaryProject;
  projects?: SummaryProject[];
  name?: string;
  domain?: string | null;
  ledger?: SummaryLedger[];
  activity?: { kind: string; name: string }[];
};

type Brief = {
  forModel: Record<string, unknown>;
  headline: string;
  draft: string[];
  required: string[];
  table: AiSummary['table'];
  bars: AiSummary['bars'];
};

/** Shares, prior-period change, and identical figures, computed before the model writes. */
export function buildSummaryBrief(input: SummaryInput): Brief {
  if (input.scope === 'website') return websiteBrief(input);
  return catalogBrief(input);
}

/** Keep the computed headline, table, and bars. Use the draft when the reply drops a share or a match. */
export function applyBrief(summary: AiSummary, brief: Brief): AiSummary {
  const text = summary.paragraphs.join(' ').toLowerCase();
  const covered = brief.required.every(phrase => text.includes(phrase.toLowerCase()));
  return {
    ...summary,
    headline: brief.headline,
    paragraphs: covered ? summary.paragraphs : brief.draft,
    table: brief.table ?? summary.table,
    bars: brief.bars ?? summary.bars,
  };
}

export function periodLabel(start: Date, end: Date) {
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days <= 1) return 'last 24 hours';
  if (days >= 6 && days <= 8) return 'last 7 days';
  if (days >= 28 && days <= 31) return 'last 30 days';
  if (days >= 89 && days <= 92) return 'last 90 days';
  return `${Math.max(days, 1)} days`;
}

function catalogBrief(input: SummaryInput): Brief {
  const projects = (input.projects ?? []).filter(project => project.name !== 'All sites');
  const totals = input.totals ?? sumProjects(projects);
  const title =
    input.scope === 'apis'
      ? 'APIs'
      : input.scope === 'projects'
        ? 'Projects'
        : (input.totals?.name ?? 'Overview');
  const headline = `${title}, ${input.period}`;
  const leaders = [...projects].sort((a, b) => b.pageviews - a.pageviews).slice(0, 6);
  const errorSources = [...projects]
    .filter(project => project.errors > 0)
    .sort((a, b) => b.errors - a.errors);
  const topErrors = errorGroup(errorSources);
  const errorShare = percent(
    topErrors.reduce((sum, project) => sum + project.errors, 0),
    totals.errors,
  );
  const trafficMatches = identical(projects, project =>
    project.pageviews > 0 ? `${project.pageviews}:${project.visitors}` : '',
  );
  const errorMatches = identical(projects, project =>
    project.errors > 0 ? String(project.errors) : '',
  );
  const pageviewsChange = signed(totals.pageviewsTrend);
  const requestsChange = signed(totals.requestsTrend);

  const leaderSentence = leaders.length
    ? leaderLine(leaders, totals.pageviews)
    : 'No pageviews were recorded.';
  const errorSentence =
    totals.requests > 0
      ? `Of ${format(totals.requests)} requests, ${totals.errorRate} (${format(totals.errors)}) errored${requestsChange === 'new' ? '' : `, requests ${requestsChange} versus the previous period`}.`
      : 'No API requests were recorded.';
  const contributor =
    topErrors.length > 0
      ? `${joinNames(topErrors.map(project => project.name))} ${topErrors.length > 1 ? 'account' : 'accounts'} for ${errorShare} of errors${
          topErrors.length > 1 &&
          topErrors.every(project => project.errors === topErrors[0]?.errors)
            ? `, ${format(topErrors[0].errors)} each`
            : ''
        }.`
      : '';
  const matchSentence = matchLine(trafficMatches, errorMatches);
  const lookFirst =
    topErrors.length > 0
      ? `Look at ${joinNames(topErrors.map(project => project.name))} first.`
      : leaders[0]
        ? `Look at ${leaders[0].name} first.`
        : 'Nothing stands out in this range.';

  const draft = [
    `${input.period[0]?.toUpperCase()}${input.period.slice(1)}: ${format(totals.pageviews)} pageviews from ${format(totals.visitors)} visitors, pageviews ${pageviewsChange} versus the previous period.`,
    leaderSentence,
    [errorSentence, contributor].filter(Boolean).join(' '),
    [matchSentence, lookFirst].filter(Boolean).join(' '),
  ].filter(sentence => sentence.length > 0);

  const required = [
    input.period,
    totals.errorRate,
    ...leaders.slice(0, 2).map(project => percent(project.pageviews, totals.pageviews)),
    ...(topErrors.length ? [errorShare] : []),
    ...(matchSentence ? ['match exactly'] : []),
  ].filter(phrase => phrase && phrase !== '0%');

  return {
    headline,
    draft: draft.slice(0, 4),
    required,
    table: leaders.length
      ? {
          columns: ['Name', 'Pageviews', 'Visitors', 'Share', 'Errors'],
          rows: leaders.map(project => [
            project.name,
            format(project.pageviews),
            format(project.visitors),
            percent(project.pageviews, totals.pageviews),
            format(project.errors),
          ]),
        }
      : null,
    bars: (errorSources.length ? errorSources : leaders).slice(0, 5).map(project => ({
      label: project.name,
      value: errorSources.length ? project.errors : project.pageviews,
    })),
    forModel: {
      period: input.period,
      pageviewsChange,
      requestsChange,
      totals: {
        pageviews: totals.pageviews,
        visitors: totals.visitors,
        requests: totals.requests,
        errors: totals.errors,
        errorRate: totals.errorRate,
      },
      leaders: leaders.map(project => ({
        name: project.name,
        pageviews: project.pageviews,
        visitors: project.visitors,
        share: percent(project.pageviews, totals.pageviews),
      })),
      errors: topErrors.map(project => ({
        name: project.name,
        errors: project.errors,
        share: percent(project.errors, totals.errors),
      })),
      errorShare,
      anomalies: [matchSentence].filter(Boolean),
      lookFirst,
      draft,
    },
  };
}

function websiteBrief(input: SummaryInput): Brief {
  const ledger = input.ledger ?? [];
  const activity = input.activity ?? [];
  const pages = activity.filter(item => item.kind === 'page').length;
  const events = activity.filter(item => item.kind === 'event').length;
  const headline = `${input.name ?? 'Website'}, ${input.period}`;
  const draft = [
    ledger.length
      ? `${input.period[0]?.toUpperCase()}${input.period.slice(1)} on ${input.name}: ${ledger.length} ledger reports, ${pages} page views, and ${events} events in the recent activity.`
      : `${input.name} recorded ${pages} page views and ${events} events in ${input.period}.`,
    ledger.length
      ? `The reports are ${joinNames(unique(ledger.map(row => row.activity)))}.`
      : 'No ledger reports are in this range.',
  ];
  return {
    headline,
    draft,
    required: [input.period],
    table: ledger.length
      ? {
          columns: ['Activity', 'Network', 'Asset', 'Result'],
          rows: ledger.slice(0, 6).map(row => [row.activity, row.network, row.asset, row.result]),
        }
      : null,
    bars: [
      { label: 'Pages', value: pages },
      { label: 'Events', value: events },
      { label: 'Ledger', value: ledger.length },
    ].filter(bar => bar.value > 0),
    forModel: {
      period: input.period,
      name: input.name,
      domain: input.domain ?? null,
      pages,
      events,
      ledger,
      draft,
    },
  };
}

function leaderLine(leaders: SummaryProject[], total: number) {
  const first = tie(leaders);
  const rest = leaders.filter(project => !first.includes(project));
  const second = tie(rest);
  if (!first.length || !first[0]) return 'No pageviews were recorded.';
  const lead = `${joinNames(first.map(project => project.name))} ${first.length > 1 ? 'lead' : 'leads'} with ${format(first[0].pageviews)} pageviews (${percent(first[0].pageviews, total)} of traffic${first.length > 1 ? ' apiece' : ''})`;
  if (!second[0]) return `${lead}.`;
  return `${lead}, followed by ${joinNames(second.map(project => project.name))} at ${format(second[0].pageviews)} (${percent(second[0].pageviews, total)}).`;
}

function tie(projects: SummaryProject[]) {
  const top = projects[0];
  if (!top || top.pageviews <= 0) return [];
  return projects.filter(
    project => project.pageviews === top.pageviews && project.visitors === top.visitors,
  );
}

function matchLine(traffic: SummaryProject[][], errors: SummaryProject[][]) {
  const parts = [
    ...traffic.slice(0, 3).map(group => {
      const sample = group[0];
      return sample
        ? `${joinNames(group.map(project => project.name))} match exactly at ${format(sample.pageviews)} pageviews`
        : '';
    }),
    ...errors.slice(0, 2).map(group => {
      const sample = group[0];
      return sample
        ? `${joinNames(group.map(project => project.name))} match exactly at ${format(sample.errors)} errors`
        : '';
    }),
  ].filter(Boolean);
  if (!parts.length) return '';
  return `${parts.join(', and ')}. Those identical figures may be test or duplicated data.`;
}

function errorGroup(sources: SummaryProject[]) {
  if (!sources.length) return [];
  const top = sources[0]?.errors ?? 0;
  const tied = sources.filter(project => project.errors === top);
  return tied.length > 1 ? tied : sources.slice(0, 3);
}

function identical(projects: SummaryProject[], key: (project: SummaryProject) => string) {
  const groups = new Map<string, SummaryProject[]>();
  for (const project of projects) {
    const id = key(project);
    if (!id) continue;
    groups.set(id, [...(groups.get(id) ?? []), project]);
  }
  return [...groups.values()]
    .filter(group => group.length > 1)
    .sort((a, b) => (b[0]?.pageviews ?? 0) - (a[0]?.pageviews ?? 0));
}

function sumProjects(projects: SummaryProject[]): SummaryProject {
  const totals = projects.reduce(
    (sum, project) => ({
      pageviews: sum.pageviews + project.pageviews,
      visitors: sum.visitors + project.visitors,
      requests: sum.requests + project.requests,
      errors: sum.errors + project.errors,
      pageviewsPrevious: sum.pageviewsPrevious + project.pageviewsPrevious,
      visitorsPrevious: sum.visitorsPrevious + project.visitorsPrevious,
      requestsPrevious: sum.requestsPrevious + project.requestsPrevious,
    }),
    {
      pageviews: 0,
      visitors: 0,
      requests: 0,
      errors: 0,
      pageviewsPrevious: 0,
      visitorsPrevious: 0,
      requestsPrevious: 0,
    },
  );
  return {
    name: 'All',
    ...totals,
    errorRate: percent(totals.errors, totals.requests),
    p95: null,
    pageviewsTrend: change(totals.pageviews, totals.pageviewsPrevious),
    visitorsTrend: change(totals.visitors, totals.visitorsPrevious),
    requestsTrend: change(totals.requests, totals.requestsPrevious),
  };
}

function change(current: number, previous: number) {
  if (previous === 0) return current === 0 ? '0%' : 'new';
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

function signed(trend: string) {
  if (!trend || trend === 'new' || trend.startsWith('+') || trend.startsWith('-'))
    return trend || '0%';
  return trend === '0%' ? trend : `+${trend}`;
}

function percent(part: number, whole: number) {
  if (whole <= 0) return '0%';
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

function format(value: number) {
  return value.toLocaleString('en-US');
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

function unique(values: string[]) {
  return [...new Set(values)];
}
