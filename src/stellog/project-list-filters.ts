import { displayedTrend } from '@/stellog/demo-series';

export const PROJECT_PAGE_SIZE = 20;

export const FILTER_PARAM_KEYS = ['fsrc', 'ferr', 'fp95', 'ftrend', 'fpv', 'freq'] as const;

export type FilterQuery = Partial<Record<(typeof FILTER_PARAM_KEYS)[number], string>>;

export type ProjectFilterRow = {
  name: string;
  sites: number;
  apis: number;
  pageviews: number;
  visitors: number;
  requests: number;
  errorRate: number;
  p95: number | null;
  requestsGrowth: number | null;
  pageviewsGrowth: number | null;
  requestsPrevious: number;
  pageviewsPrevious: number;
};

export type FilterChipModel = {
  key: (typeof FILTER_PARAM_KEYS)[number];
  label: string;
  operator: string;
  value: string;
};

export type FilterDraft = {
  sourceOp: 'eq' | 'neq';
  source: '' | 'site' | 'api' | 'both';
  errorPreset: '' | 'lt0.5' | 'mid' | 'gt1' | 'custom';
  errorOp: 'gt' | 'lt' | 'between';
  errorMin: string;
  errorMax: string;
  p95Preset: '' | 'lt100' | 'mid' | 'gt150' | 'custom';
  p95Op: 'gt' | 'lt' | 'between';
  p95Min: string;
  p95Max: string;
  trendPreset: '' | 'up' | 'flat' | 'down' | 'custom';
  trendMin: string;
  trendMax: string;
  pageviewMin: string;
  pageviewMax: string;
  requestMin: string;
  requestMax: string;
};

const SOURCE_LABEL = { site: 'Site only', api: 'API only', both: 'Both' } as const;

export function emptyDraft(): FilterDraft {
  return {
    sourceOp: 'eq',
    source: '',
    errorPreset: '',
    errorOp: 'lt',
    errorMin: '',
    errorMax: '',
    p95Preset: '',
    p95Op: 'lt',
    p95Min: '',
    p95Max: '',
    trendPreset: '',
    trendMin: '',
    trendMax: '',
    pageviewMin: '',
    pageviewMax: '',
    requestMin: '',
    requestMax: '',
  };
}

export function draftFromQuery(query: FilterQuery): FilterDraft {
  const draft = emptyDraft();
  const source = query.fsrc?.split(':') ?? [];
  if ((source[0] === 'eq' || source[0] === 'neq') && isSource(source[1])) {
    draft.sourceOp = source[0];
    draft.source = source[1];
  }

  draft.errorPreset = errorPreset(query.ferr);
  if (draft.errorPreset === 'custom') {
    const rule = parseRule(query.ferr);
    if (rule?.op === 'gt' || rule?.op === 'lt' || rule?.op === 'between') {
      draft.errorOp = rule.op;
      draft.errorMin = rule.min == null ? '' : trimNumber(rule.min * 100);
      draft.errorMax = rule.max == null ? '' : trimNumber(rule.max * 100);
    }
  }

  draft.p95Preset = p95Preset(query.fp95);
  if (draft.p95Preset === 'custom') {
    const rule = parseRule(query.fp95);
    if (rule?.op === 'gt' || rule?.op === 'lt' || rule?.op === 'between') {
      draft.p95Op = rule.op;
      draft.p95Min = rule.min == null ? '' : trimNumber(rule.min);
      draft.p95Max = rule.max == null ? '' : trimNumber(rule.max);
    }
  }

  if (query.ftrend === 'gt:0') draft.trendPreset = 'up';
  else if (query.ftrend === 'eq:0') draft.trendPreset = 'flat';
  else if (query.ftrend === 'lt:0') draft.trendPreset = 'down';
  else if (query.ftrend?.startsWith('between:')) {
    draft.trendPreset = 'custom';
    const rule = parseRule(query.ftrend);
    draft.trendMin = rule?.min == null ? '' : trimNumber(rule.min);
    draft.trendMax = rule?.max == null ? '' : trimNumber(rule.max);
  }

  const views = splitRange(query.fpv);
  draft.pageviewMin = views.min;
  draft.pageviewMax = views.max;
  const requests = splitRange(query.freq);
  draft.requestMin = requests.min;
  draft.requestMax = requests.max;
  return draft;
}

export function queryFromDraft(draft: FilterDraft): Record<(typeof FILTER_PARAM_KEYS)[number], string | undefined> {
  return {
    fsrc: draft.source ? `${draft.sourceOp}:${draft.source}` : undefined,
    ferr: errorQuery(draft),
    fp95: p95Query(draft),
    ftrend: trendQuery(draft),
    fpv: rangeQuery(draft.pageviewMin, draft.pageviewMax),
    freq: rangeQuery(draft.requestMin, draft.requestMax),
  };
}

export function activeFilterChips(query: FilterQuery): FilterChipModel[] {
  const chips: FilterChipModel[] = [];
  const source = query.fsrc?.split(':') ?? [];
  if ((source[0] === 'eq' || source[0] === 'neq') && isSource(source[1])) {
    chips.push({
      key: 'fsrc',
      label: 'Properties',
      operator: source[0] === 'eq' ? 'is' : 'is not',
      value: SOURCE_LABEL[source[1]],
    });
  }

  const error = describeNumber(query.ferr, 'Error rate', percent);
  if (error) chips.push({ key: 'ferr', ...error });
  const latency = describeNumber(query.fp95, 'p95', milliseconds);
  if (latency) chips.push({ key: 'fp95', ...latency });

  if (query.ftrend === 'gt:0') chips.push({ key: 'ftrend', label: 'Trend', operator: 'is', value: 'Growing' });
  else if (query.ftrend === 'eq:0') chips.push({ key: 'ftrend', label: 'Trend', operator: 'is', value: 'Flat' });
  else if (query.ftrend === 'lt:0') chips.push({ key: 'ftrend', label: 'Trend', operator: 'is', value: 'Declining' });
  else {
    const trend = describeNumber(query.ftrend, 'Trend', signedPercent);
    if (trend) chips.push({ key: 'ftrend', ...trend });
  }

  const views = describeRange(query.fpv, 'Pageviews');
  if (views) chips.push({ key: 'fpv', ...views });
  const requests = describeRange(query.freq, 'API requests');
  if (requests) chips.push({ key: 'freq', ...requests });
  return chips;
}

export function filterProjects<T extends ProjectFilterRow>(rows: T[], query: FilterQuery, search: string): T[] {
  const needle = search.trim().toLowerCase();
  return rows.filter(row => {
    if (needle && !row.name.toLowerCase().includes(needle)) return false;
    if (!matchesSource(row, query.fsrc)) return false;
    if (!matchesNumber(row.requests > 0 ? row.errorRate : null, query.ferr)) return false;
    if (!matchesNumber(row.p95, query.fp95)) return false;
    if (!matchesTrend(trendPercent(row), query.ftrend)) return false;
    if (!matchesRange(row.pageviews, query.fpv)) return false;
    if (!matchesRange(row.requests, query.freq)) return false;
    return true;
  });
}

export type ProjectSortKey = 'name' | 'pageviews' | 'visitors' | 'requests' | 'errorRate' | 'p95' | 'trend';

export function sortProjects<T extends ProjectFilterRow>(
  rows: T[],
  sort: ProjectSortKey,
  order: 'asc' | 'desc',
): T[] {
  const direction = order === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = sortValue(left, sort);
    const b = sortValue(right, sort);
    if (a == null && b == null) return left.name.localeCompare(right.name);
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b) * direction;
    return ((a as number) - (b as number)) * direction;
  });
}

export function trendPercent(row: ProjectFilterRow): number | null {
  const api = row.requests > 0 || row.requestsPrevious > 0;
  const current = api ? row.requests : row.pageviews;
  const previous = api ? row.requestsPrevious : row.pageviewsPrevious;
  const growth = api ? row.requestsGrowth : row.pageviewsGrowth;
  if ((current === 0 && previous === 0) || (previous === 0 && current > 0)) return null;
  const shown = displayedTrend(growth);
  if (shown == null || !Number.isFinite(shown)) return null;
  return Math.round(shown * 100);
}

function sortValue(row: ProjectFilterRow, sort: ProjectSortKey): string | number | null {
  if (sort === 'name') return row.name.toLowerCase();
  if (sort === 'pageviews') return row.pageviews;
  if (sort === 'visitors') return row.visitors;
  if (sort === 'requests') return row.requests;
  if (sort === 'errorRate') return row.requests > 0 ? row.errorRate : null;
  if (sort === 'p95') return row.p95;
  return trendPercent(row);
}

function matchesSource(row: ProjectFilterRow, raw?: string) {
  if (!raw) return true;
  const [op, value] = raw.split(':');
  if (!isSource(value) || (op !== 'eq' && op !== 'neq')) return true;
  const kind = row.sites > 0 && row.apis > 0 ? 'both' : row.sites > 0 ? 'site' : row.apis > 0 ? 'api' : 'none';
  return op === 'eq' ? kind === value : kind !== value;
}

function matchesNumber(value: number | null, raw?: string) {
  const rule = parseRule(raw);
  if (!rule) return true;
  if (value == null || !Number.isFinite(value)) return false;
  if (rule.op === 'gt') return rule.min != null && value > rule.min;
  if (rule.op === 'lt') return rule.min != null && value < rule.min;
  if (rule.op === 'between') return rule.min != null && rule.max != null && value >= rule.min && value <= rule.max;
  return true;
}

function matchesTrend(percent: number | null, raw?: string) {
  if (!raw) return true;
  if (percent == null) return false;
  if (raw === 'gt:0') return percent > 0;
  if (raw === 'lt:0') return percent < 0;
  if (raw === 'eq:0') return percent === 0;
  const rule = parseRule(raw);
  if (rule?.op === 'between' && rule.min != null && rule.max != null) {
    return percent >= rule.min && percent <= rule.max;
  }
  return true;
}

function matchesRange(value: number, raw?: string) {
  if (!raw) return true;
  const [minRaw, maxRaw] = raw.split(':');
  const min = minRaw === '' ? undefined : Number(minRaw);
  const max = maxRaw === '' ? undefined : Number(maxRaw);
  if (min != null && Number.isFinite(min) && value < min) return false;
  if (max != null && Number.isFinite(max) && value > max) return false;
  return true;
}

function errorQuery(draft: FilterDraft) {
  if (draft.errorPreset === 'lt0.5') return 'lt:0.005';
  if (draft.errorPreset === 'mid') return 'between:0.005:0.01';
  if (draft.errorPreset === 'gt1') return 'gt:0.01';
  if (draft.errorPreset === 'custom') return numberQuery(draft.errorOp, draft.errorMin, draft.errorMax, 0.01);
  return undefined;
}

function p95Query(draft: FilterDraft) {
  if (draft.p95Preset === 'lt100') return 'lt:100';
  if (draft.p95Preset === 'mid') return 'between:100:150';
  if (draft.p95Preset === 'gt150') return 'gt:150';
  if (draft.p95Preset === 'custom') return numberQuery(draft.p95Op, draft.p95Min, draft.p95Max, 1);
  return undefined;
}

function trendQuery(draft: FilterDraft) {
  if (draft.trendPreset === 'up') return 'gt:0';
  if (draft.trendPreset === 'flat') return 'eq:0';
  if (draft.trendPreset === 'down') return 'lt:0';
  if (draft.trendPreset !== 'custom') return undefined;
  const min = numberOrUndefined(draft.trendMin);
  const max = numberOrUndefined(draft.trendMax);
  if (min == null || max == null) return undefined;
  return `between:${trimNumber(min)}:${trimNumber(max)}`;
}

function numberQuery(op: 'gt' | 'lt' | 'between', minRaw: string, maxRaw: string, scale: number) {
  const min = numberOrUndefined(minRaw);
  const max = numberOrUndefined(maxRaw);
  if (op === 'between') {
    if (min == null || max == null) return undefined;
    return `between:${trimNumber(min * scale)}:${trimNumber(max * scale)}`;
  }
  if (min == null) return undefined;
  return `${op}:${trimNumber(min * scale)}`;
}

function rangeQuery(minRaw: string, maxRaw: string) {
  const min = numberOrUndefined(minRaw);
  const max = numberOrUndefined(maxRaw);
  if (min == null && max == null) return undefined;
  return `${min == null ? '' : trimNumber(min)}:${max == null ? '' : trimNumber(max)}`;
}

function describeNumber(
  raw: string | undefined,
  label: string,
  format: (value: number) => string,
): Omit<FilterChipModel, 'key'> | undefined {
  const rule = parseRule(raw);
  if (!rule) return undefined;
  if (rule.op === 'gt' && rule.min != null) return { label, operator: '>', value: format(rule.min) };
  if (rule.op === 'lt' && rule.min != null) return { label, operator: '<', value: format(rule.min) };
  if (rule.op === 'between' && rule.min != null && rule.max != null) {
    return { label, operator: 'between', value: `${format(rule.min)} – ${format(rule.max)}` };
  }
  return undefined;
}

function describeRange(raw: string | undefined, label: string): Omit<FilterChipModel, 'key'> | undefined {
  if (!raw || !raw.includes(':')) return undefined;
  const [minRaw, maxRaw] = raw.split(':');
  const min = minRaw === '' ? undefined : Number(minRaw);
  const max = maxRaw === '' ? undefined : Number(maxRaw);
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  if (hasMin && hasMax) return { label, operator: 'between', value: `${min.toLocaleString()} – ${max.toLocaleString()}` };
  if (hasMin) return { label, operator: '≥', value: min.toLocaleString() };
  if (hasMax) return { label, operator: '≤', value: max.toLocaleString() };
  return undefined;
}

function parseRule(raw?: string): { op: string; min?: number; max?: number } | undefined {
  if (!raw) return undefined;
  const [op, first, second] = raw.split(':');
  if (op !== 'gt' && op !== 'lt' && op !== 'between') return undefined;
  const min = first === '' || first == null ? undefined : Number(first);
  const max = second === '' || second == null ? undefined : Number(second);
  if (op === 'between') {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
    return { op, min, max };
  }
  if (!Number.isFinite(min)) return undefined;
  return { op, min };
}

function errorPreset(raw?: string): FilterDraft['errorPreset'] {
  if (!raw) return '';
  if (raw === 'lt:0.005') return 'lt0.5';
  if (raw === 'between:0.005:0.01') return 'mid';
  if (raw === 'gt:0.01') return 'gt1';
  return parseRule(raw) ? 'custom' : '';
}

function p95Preset(raw?: string): FilterDraft['p95Preset'] {
  if (!raw) return '';
  if (raw === 'lt:100') return 'lt100';
  if (raw === 'between:100:150') return 'mid';
  if (raw === 'gt:150') return 'gt150';
  return parseRule(raw) ? 'custom' : '';
}

function splitRange(raw?: string) {
  if (!raw || !raw.includes(':')) return { min: '', max: '' };
  const [min, max] = raw.split(':');
  return { min: min && Number.isFinite(Number(min)) ? trimNumber(Number(min)) : '', max: max && Number.isFinite(Number(max)) ? trimNumber(Number(max)) : '' };
}

function percent(value: number) {
  return `${trimNumber(value * 100)}%`;
}

function signedPercent(value: number) {
  return `${trimNumber(value)}%`;
}

function milliseconds(value: number) {
  return `${trimNumber(value)} ms`;
}

function trimNumber(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

function numberOrUndefined(raw: string) {
  if (raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function isSource(value: string | undefined): value is 'site' | 'api' | 'both' {
  return value === 'site' || value === 'api' || value === 'both';
}
