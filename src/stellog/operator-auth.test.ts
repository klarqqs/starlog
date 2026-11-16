import { beforeEach, describe, expect, test, vi } from 'vitest';
import { checkAuth } from '@/lib/auth';
import { findActiveOperatorKey } from '@/stellog/operator-key';
import {
  authorizeOperatorRead,
  canManageOperatorProjects,
  canReadOperatorProjects,
  requireOperatorAdmin,
} from './operator-auth';

vi.mock('@/lib/auth', () => ({
  getBearerToken: (request: Request) => request.headers.get('authorization')?.split(' ')[1],
  checkAuth: vi.fn(),
}));

vi.mock('@/stellog/operator-key', () => ({
  findActiveOperatorKey: vi.fn(),
}));

const checkAuthMock = vi.mocked(checkAuth);
const findKeyMock = vi.mocked(findActiveOperatorKey);

beforeEach(() => {
  checkAuthMock.mockReset();
  findKeyMock.mockReset();
});

describe('operator authorization', () => {
  test('a live operator key can read and cannot administer', async () => {
    findKeyMock.mockResolvedValue({ id: 'key-1' });
    const request = new Request('http://localhost/api/operator/projects', {
      headers: { authorization: 'Bearer opk_secret' },
    });

    await expect(authorizeOperatorRead(request)).resolves.toBe('key');
    await expect(requireOperatorAdmin(request)).resolves.toBeNull();
    expect(checkAuthMock).not.toHaveBeenCalled();
  });

  test('a revoked or unknown operator key is rejected', async () => {
    findKeyMock.mockResolvedValue(null);
    const request = new Request('http://localhost/api/operator/projects', {
      headers: { authorization: 'Bearer opk_revoked' },
    });

    await expect(authorizeOperatorRead(request)).resolves.toBeNull();
    expect(checkAuthMock).not.toHaveBeenCalled();
  });

  test('a non-admin session cannot read or administer', async () => {
    checkAuthMock.mockResolvedValue({ user: { id: 'user-1', isAdmin: false } } as any);
    const request = new Request('http://localhost/api/operator/projects', {
      headers: { authorization: 'Bearer session' },
    });

    await expect(authorizeOperatorRead(request)).resolves.toBeNull();
    await expect(requireOperatorAdmin(request)).resolves.toBeNull();
  });

  test('the demo operator can read projects and cannot manage them', () => {
    const operator = { role: 'operator', isAdmin: false };
    const admin = { role: 'admin', isAdmin: true };
    expect(canReadOperatorProjects(operator)).toBe(true);
    expect(canManageOperatorProjects(operator)).toBe(false);
    expect(canReadOperatorProjects(admin)).toBe(true);
    expect(canManageOperatorProjects(admin)).toBe(true);
    expect(canReadOperatorProjects({ role: 'user', isAdmin: false })).toBe(false);
  });
});
