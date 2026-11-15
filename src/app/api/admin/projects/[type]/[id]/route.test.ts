import { beforeEach, describe, expect, test, vi } from 'vitest';
import { requireOperatorAdmin } from '@/stellog/operator-auth';
import { removeProject } from '@/stellog/operator-projects';
import { DELETE } from './route';

vi.mock('@/stellog/operator-auth', () => ({
  requireOperatorAdmin: vi.fn(),
}));

vi.mock('@/stellog/operator-projects', () => ({
  projectPath: (type: string, id: string) =>
    type === 'team' || type === 'website' ? { type, id } : null,
  removeProject: vi.fn(),
}));

const adminMock = vi.mocked(requireOperatorAdmin);
const removeMock = vi.mocked(removeProject);
const teamId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

beforeEach(() => {
  adminMock.mockReset();
  removeMock.mockReset();
});

describe('DELETE /api/admin/projects/:type/:id', () => {
  test('an operator key cannot remove a project', async () => {
    adminMock.mockResolvedValue(null);

    const response = await DELETE(
      new Request(`http://localhost/api/admin/projects/team/${teamId}`),
      {
        params: Promise.resolve({ type: 'team', id: teamId }),
      },
    );

    expect(response.status).toBe(401);
    expect(removeMock).not.toHaveBeenCalled();
  });

  test('an admin removes only the project in the path', async () => {
    adminMock.mockResolvedValue({ user: { isAdmin: true } } as any);
    removeMock.mockResolvedValue(true);

    const response = await DELETE(
      new Request(`http://localhost/api/admin/projects/team/${teamId}`),
      {
        params: Promise.resolve({ type: 'team', id: teamId }),
      },
    );

    expect(response.status).toBe(200);
    expect(removeMock).toHaveBeenCalledWith('team', teamId);
  });
});
