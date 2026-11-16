import { expect, test } from 'vitest';
import { applyBrief, buildSummaryBrief, type SummaryProject } from './summary-brief';
import { parseSummary } from './summary-text';

test('reads a fenced summary', () => {
  const summary = parseSummary(
    '```json\n{"headline":"Obba today","paragraphs":["Two visitors viewed the home page.","Four ledger reports arrived."],"table":{"columns":["Activity","Asset"],"rows":[["Payment sent","USDC"]]},"bars":[{"label":"Visits","value":5}]}\n```',
  );
  expect(summary?.headline).toBe('Obba today');
  expect(summary?.bars?.[0]).toEqual({ label: 'Visits', value: 5 });
});

test('rejects a reply that is not the summary shape', () => {
  expect(parseSummary('{"headline":"Only a title"}')).toBeNull();
  expect(parseSummary('not json')).toBeNull();
});

test('summary brief adds shares, the prior period, and identical figures', () => {
  const brief = buildSummaryBrief({
    scope: 'projects',
    period: 'last 30 days',
    totals: project('All sites', 22443, 10094, 126657, 6545, '5.2%'),
    projects: [
      project('Authline', 2452, 1104, 0, 0),
      project('LumAgg', 2452, 1104, 0, 0),
      project('Bexo', 2065, 931, 0, 0),
      project('Sava', 2065, 931, 0, 0),
      project('Azza', 782, 341, 0, 0),
      project('Blockroll', 782, 341, 0, 0),
      project('Liqvid API', 0, 0, 20000, 1044),
      project('Neko API', 0, 0, 20000, 1044),
      project('Pipeline API', 0, 0, 20000, 1044),
      project('Authline API', 0, 0, 6000, 290),
    ],
  });

  expect(brief.headline).toBe('Projects, last 30 days');
  expect(brief.forModel.leaders).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Authline', share: '10.9%' }),
      expect.objectContaining({ name: 'LumAgg', share: '10.9%' }),
    ]),
  );
  expect(brief.draft.join(' ')).toContain('47.9% of errors');
  expect(brief.draft.join(' ')).toContain('match exactly');
  expect(brief.draft.join(' ')).toContain('versus the previous period');
  expect(brief.table?.columns).toContain('Share');
});

test('a reply that drops the shares falls back to the computed draft', () => {
  const brief = buildSummaryBrief({
    scope: 'overview',
    period: 'last 30 days',
    totals: project('All sites', 100, 40, 50, 5, '10%'),
    projects: [project('Sorted', 100, 40, 50, 5)],
  });
  const summary = parseSummary(
    '{"headline":"All sites","paragraphs":["Sorted had 100 pageviews."],"table":null,"bars":null}',
  );
  const applied = summary && applyBrief(summary, brief);
  expect(applied?.headline).toBe('All sites, last 30 days');
  expect(applied?.paragraphs.join(' ')).toContain('versus the previous period');
  expect(applied?.paragraphs.join(' ')).toContain('10%');
});

function project(
  name: string,
  pageviews: number,
  visitors: number,
  requests: number,
  errors: number,
  errorRate = requests ? `${Math.round((errors / requests) * 1000) / 10}%` : '0%',
): SummaryProject {
  return {
    name,
    pageviews,
    visitors,
    requests,
    errors,
    errorRate,
    p95: null,
    pageviewsTrend: '3%',
    visitorsTrend: '3%',
    requestsTrend: '-2%',
    pageviewsPrevious: 0,
    visitorsPrevious: 0,
    requestsPrevious: 0,
  };
}
