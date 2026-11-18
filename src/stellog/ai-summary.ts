import prisma from '@/lib/prisma';
import { readLedger } from '@/stellog/ledger';
import { readMyOverview } from '@/stellog/my-overview';
import { readOperatorProjects } from '@/stellog/operator-metrics';
import type { OperatorProject } from '@/stellog/operator-report';
import {
  applyBrief,
  buildSummaryBrief,
  periodLabel,
  type SummaryInput,
} from '@/stellog/summary-brief';
import { type AiSummary, parseSummary, type SummaryScope } from '@/stellog/summary-text';

export type { AiSummary, SummaryScope };
export { parseSummary };

export async function collectSummaryFacts(
  scope: SummaryScope,
  userId: string,
  operator: boolean,
  start: Date,
  end: Date,
  websiteId?: string,
) {
  if (scope === 'website') {
    if (!websiteId) throw new Error('websiteId is required.');
    return websiteFacts(websiteId, start, end);
  }
  if (scope === 'projects') {
    const projects = await readOperatorProjects(start, end, { sort: 'requests', order: 'desc' });
    return {
      scope,
      period: periodLabel(start, end),
      projects: projects.map(briefProject),
    };
  }
  const overview = await readMyOverview(userId, start, end, undefined, operator);
  const sites =
    scope === 'apis' ? overview.sites.filter(site => site.kind === 'api') : overview.sites;
  return {
    scope,
    period: periodLabel(start, end),
    totals: briefProject(overview.totals),
    projects: sites.map(site => briefProject(site)),
  };
}

export async function requestSummary(facts: SummaryInput, apiKey?: string): Promise<AiSummary> {
  const brief = buildSummaryBrief(facts);
  const key = apiKey?.trim();
  if (!key) throw new Error('Add an xAI API key to write a summary.');
  const model = process.env.XAI_MODEL?.trim() || 'grok-3-mini';
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are an analytics assistant. Reply with JSON only, no markdown. ' +
            'Shape: {"headline": string, "paragraphs": string[], "table": null, "bars": null}. ' +
            'Rewrite draft into 3 or 4 short sentences: overall traffic and the change versus the previous period, ' +
            'who leads with the share strings given, the error rate and the biggest contributors with their share, and one next step. ' +
            'Keep every share, change, and name from draft. If anomalies is not empty, say those names match exactly and that the match may be test or duplicated data. ' +
            'Do not invent numbers, causes, wallets, amounts, or addresses.',
        },
        { role: 'user', content: JSON.stringify(brief.forModel) },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('That API key was not accepted.');
  }
  if (!response.ok) {
    throw new Error('The summary service did not answer.');
  }
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? '';
  const summary = parseSummary(content);
  if (!summary) throw new Error('The summary could not be read.');
  return applyBrief(summary, brief);
}

function briefProject(project: OperatorProject) {
  return {
    name: project.name,
    domain: project.domain,
    pageviews: project.pageviews,
    visitors: project.visitors,
    requests: project.requests,
    errors: project.errors,
    errorRate: `${Math.round(project.errorRate * 1000) / 10}%`,
    p95: project.p95 === null ? null : Math.round(project.p95),
    pageviewsTrend: trend(project.pageviewsGrowth),
    visitorsTrend: trend(project.visitorsGrowth),
    requestsTrend: trend(project.requestsGrowth),
    pageviewsPrevious: project.pageviewsPrevious,
    visitorsPrevious: project.visitorsPrevious,
    requestsPrevious: project.requestsPrevious,
  };
}

function trend(value: number | null) {
  if (value === null) return 'new';
  return `${Math.round(value * 100)}%`;
}

async function websiteFacts(websiteId: string, start: Date, end: Date) {
  const website = await prisma.client.website.findFirst({
    where: { id: websiteId, deletedAt: null },
    select: { name: true, domain: true },
  });
  const [ledger, events] = await Promise.all([
    readLedger(websiteId, start, end),
    prisma.client.websiteEvent.findMany({
      where: { websiteId, createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { createdAt: true, eventType: true, eventName: true, urlPath: true },
    }),
  ]);
  return {
    scope: 'website',
    period: periodLabel(start, end),
    name: website?.name ?? 'Website',
    domain: website?.domain ?? null,
    ledger: ledger.slice(0, 8).map(row => ({
      activity: row.title,
      network: row.network === 'testnet' ? 'Testnet' : row.network === 'mainnet' ? 'Mainnet' : '—',
      asset: row.asset || '—',
      result: row.success === 'true' ? 'Succeeded' : row.success === 'false' ? 'Failed' : '—',
      when: row.createdAt,
    })),
    activity: events.map(event => ({
      when: event.createdAt.toISOString(),
      kind: event.eventType === 2 ? 'event' : 'page',
      name: event.eventType === 2 ? event.eventName || 'event' : event.urlPath || '/',
    })),
  };
}
