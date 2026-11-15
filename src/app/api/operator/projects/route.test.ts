import { beforeEach, describe, expect, test, vi } from 'vitest';
import { authorizeOperatorRead } from '@/stellog/operator-auth';
import { readOperatorProjects } from '@/stellog/operator-metrics';
import * as route from './route';

vi.mock('@/stellog/operator-auth', () => ({
  authorizeOperatorRead: vi.fn(),
}));

vi.mock('@/stellog/operator-metrics', () => ({
  readOperatorProjects: vi.fn(),
}));

const authorizeMock = vi.mocked(authorizeOperatorRead);
const readMock = vi.mocked(readOperatorProjects);

beforeEach(() => {
  authorizeMock.mockReset();
  readMock.mockReset();
});

describe('GET /api/operator/projects', () => {
  test('does not read metrics when the caller is not an operator', async () => {
    authorizeMock.mockResolvedValue(null);

    const response = await route.GET(request());

    expect(response.status).toBe(401);
    expect(readMock).not.toHaveBeenCalled();
  });

  test('returns the ranked projects for an operator key', async () => {
    authorizeMock.mockResolvedValue('key');
    readMock.mockResolvedValue([
      { id: 'team:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Alpha', requests: 4 },
    ] as any);

    const response = await route.GET(request());

    expect(response.status).toBe(200);
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(readMock.mock.calls[0][0]).toEqual(new Date(10));
    expect(readMock.mock.calls[0][1]).toEqual(new Date(20));
    await expect(response.json()).resolves.toMatchObject({
      projects: [{ name: 'Alpha', requests: 4 }],
    });
  });

  test('has no write method', () => {
    expect(route).not.toHaveProperty('POST');
    expect(route).not.toHaveProperty('DELETE');
  });
});

function request() {
  return new Request('http://localhost/api/operator/projects?startAt=10&endAt=20&unit=hour');
}
