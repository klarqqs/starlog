import { beforeEach, describe, expect, test, vi } from 'vitest';
import { parseRequest } from '@/lib/request';
import { canViewWebsite } from '@/permissions';
import { readTenantMetrics } from '@/stellog/tenant-metrics';
import { GET } from './route';

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canViewWebsite: vi.fn(),
}));

vi.mock('@/stellog/tenant-metrics', () => ({
  readTenantMetrics: vi.fn(),
}));

const parseRequestMock = vi.mocked(parseRequest);
const canViewWebsiteMock = vi.mocked(canViewWebsite);
const readTenantMetricsMock = vi.mocked(readTenantMetrics);

const websiteA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const websiteB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

beforeEach(() => {
  parseRequestMock.mockReset();
  canViewWebsiteMock.mockReset();
  readTenantMetricsMock.mockReset();
});

describe('GET /api/websites/:websiteId/api-metrics', () => {
  test('refuses a user who cannot view the website and does not read metrics', async () => {
    parseRequestMock.mockResolvedValue({
      auth: { user: { id: 'user-b' } },
      query: { startAt: 10, endAt: 20, unit: 'hour' },
      error: undefined,
    } as any);
    canViewWebsiteMock.mockResolvedValue(false);

    const response = await GET(request(websiteA), {
      params: Promise.resolve({ websiteId: websiteA }),
    });

    expect(response.status).toBe(401);
    expect(canViewWebsiteMock).toHaveBeenCalledWith({ user: { id: 'user-b' } }, websiteA);
    expect(readTenantMetricsMock).not.toHaveBeenCalled();
  });

  test('reads only the website in the path', async () => {
    parseRequestMock.mockResolvedValue({
      auth: { user: { id: 'user-a' } },
      query: { startAt: 10, endAt: 20, unit: 'day', websiteId: websiteB },
      error: undefined,
    } as any);
    canViewWebsiteMock.mockResolvedValue(true);
    readTenantMetricsMock.mockResolvedValue({
      websiteId: websiteA,
      unit: 'day',
      requests: 3,
      p50: 50,
      p95: 100,
      p50Capped: false,
      p95Capped: false,
      series: [],
      routes: [],
      statuses: [],
    });

    const response = await GET(request(websiteA), {
      params: Promise.resolve({ websiteId: websiteA }),
    });

    expect(response.status).toBe(200);
    expect(readTenantMetricsMock).toHaveBeenCalledTimes(1);
    expect(readTenantMetricsMock).toHaveBeenCalledWith(websiteA, new Date(10), new Date(20), 'day');
    const body = await response.json();
    expect(body).toMatchObject({ websiteId: websiteA, requests: 3 });
    expect(JSON.stringify(body)).not.toContain(websiteB);
  });
});

function request(websiteId: string) {
  return new Request(
    `http://localhost/api/websites/${websiteId}/api-metrics?startAt=10&endAt=20&websiteId=${websiteB}`,
  );
}
