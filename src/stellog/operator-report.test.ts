import { describe, expect, test } from 'vitest';
import { emptyHist, histForLatency } from './histogram';
import {
  type ApiStat,
  growthRate,
  limitSelection,
  type OperatorTeam,
  type OperatorWebsite,
  parseProjectId,
  projectDomain,
  projectId,
  rankProjects,
  statusForEnrollment,
} from './operator-report';

const teamA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const teamB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const siteA = '11111111-1111-1111-1111-111111111111';
const siteB = '22222222-2222-2222-2222-222222222222';
const sitePending = '33333333-3333-3333-3333-333333333333';
const outsider = '44444444-4444-4444-4444-444444444444';

function api(websiteId: string, requests: number, latencyMs: number, statusErrors = 0): ApiStat {
  return {
    websiteId,
    requests,
    errors: statusErrors,
    latencyCount: requests,
    ...emptyHist(),
    ...histForLatency(latencyMs, requests),
  };
}

const teams: OperatorTeam[] = [
  { id: teamA, name: 'Alpha', status: 'active' },
  { id: teamB, name: 'Beta', status: 'active' },
];

const websites: OperatorWebsite[] = [
  { id: siteA, name: 'Alpha web', teamId: teamA, status: 'active' },
  { id: sitePending, name: 'Alpha waiting', teamId: teamA, status: 'pending' },
  { id: siteB, name: 'Beta web', teamId: teamB, status: 'active' },
];

describe('rankProjects', () => {
  test('keeps one project’s web and API numbers out of another', () => {
    const ranked = rankProjects(
      teams,
      websites,
      [
        { websiteId: siteA, pageviews: 10, visitors: 4 },
        { websiteId: siteB, pageviews: 3, visitors: 2 },
        { websiteId: outsider, pageviews: 99, visitors: 99 },
      ],
      [api(siteA, 8, 40), api(siteB, 5, 80, 1), api(sitePending, 100, 20), api(outsider, 50, 10)],
      { status: 'all' },
    );

    const alpha = ranked.find(project => project.id === projectId('team', teamA));
    const beta = ranked.find(project => project.id === projectId('team', teamB));

    expect(alpha).toMatchObject({
      pageviews: 10,
      visitors: 4,
      requests: 8,
      errors: 0,
      pendingProperties: 1,
      websiteIds: [siteA],
    });
    expect(beta).toMatchObject({
      pageviews: 3,
      visitors: 2,
      requests: 5,
      errors: 1,
      websiteIds: [siteB],
    });
    expect(JSON.stringify(alpha)).not.toContain(siteB);
    expect(JSON.stringify(alpha)).not.toContain(teamB);
    expect(ranked.map(project => project.id)).not.toContain(projectId('website', outsider));
  });

  test('filters by name and sorts by the chosen metric', () => {
    const ranked = rankProjects(teams, websites, [], [api(siteA, 2, 40), api(siteB, 9, 40)], {
      q: 'alp',
      sort: 'requests',
      order: 'desc',
      status: 'all',
    });

    expect(ranked.map(project => project.name)).toEqual(['Alpha']);
  });

  test('uses the website domain for the icon when the team also has an API', () => {
    const ranked = rankProjects(
      teams,
      [
        { ...websites[0], domain: 'api.alpha.test' },
        { ...websites[2], domain: 'beta.test' },
        {
          id: sitePending,
          name: 'Alpha site',
          teamId: teamA,
          status: 'active',
          domain: 'alpha.test',
        },
      ],
      [],
      [],
      { status: 'all' },
    );
    expect(ranked.find(project => project.name === 'Alpha')?.domain).toBe('alpha.test');
    expect(ranked.find(project => project.name === 'Beta')?.domain).toBe('beta.test');
    expect(projectDomain('api.a.test', 'a.test')).toBe('a.test');
    expect(projectDomain('a.test', 'api.a.test')).toBe('a.test');
  });

  test('a website without a team is its own project', () => {
    const ranked = rankProjects(
      [],
      [{ id: siteA, name: 'Solo', teamId: null, status: 'active' }],
      [{ websiteId: siteA, pageviews: 1, visitors: 1 }],
      [],
      { status: 'all' },
    );

    expect(ranked).toEqual([
      expect.objectContaining({ id: projectId('website', siteA), type: 'website', pageviews: 1 }),
    ]);
  });
});

describe('growth and comparison', () => {
  test('growth is the change against the previous period', () => {
    const ranked = rankProjects(
      teams,
      websites,
      [{ websiteId: siteA, pageviews: 30, visitors: 12 }],
      [api(siteA, 20, 40, 5)],
      {
        status: 'all',
        previous: {
          web: [{ websiteId: siteA, pageviews: 10, visitors: 10 }],
          api: [api(siteA, 10, 40)],
        },
      },
    );
    const alpha = ranked.find(project => project.id === projectId('team', teamA));
    expect(alpha).toMatchObject({
      errorRate: 0.25,
      pageviewsGrowth: 2,
      visitorsGrowth: 0.2,
      requestsGrowth: 1,
    });
    expect(growthRate(0, 0)).toBe(0);
    expect(growthRate(4, 0)).toBeNull();
  });

  test('sorts by error rate', () => {
    const ranked = rankProjects(
      teams,
      websites,
      [],
      [api(siteA, 10, 40, 1), api(siteB, 10, 40, 8)],
      { status: 'all', sort: 'errorRate', order: 'desc' },
    );
    expect(ranked.map(project => project.name)).toEqual(['Beta', 'Alpha']);
  });

  test('a comparison keeps at most four projects', () => {
    expect(limitSelection(['a', 'b', 'c', 'd'], 'e')).toEqual(['a', 'b', 'c', 'd']);
    expect(limitSelection(['a', 'b', 'c', 'd'], 'b')).toEqual(['a', 'c', 'd']);
    expect(limitSelection(['a'], 'b')).toEqual(['a', 'b']);
  });
});

describe('enrollment', () => {
  test('approval-required leaves a non-admin project pending', () => {
    expect(statusForEnrollment('approval-required', false)).toBe('pending');
    expect(statusForEnrollment('approval-required', true)).toBe('active');
    expect(statusForEnrollment('open', false)).toBe('active');
    expect(statusForEnrollment('open', false, 'pending')).toBe('pending');
  });

  test('parses only a team or website id', () => {
    expect(parseProjectId(projectId('team', teamA))).toEqual({ type: 'team', id: teamA });
    expect(parseProjectId('website:not-an-id')).toBeNull();
    expect(parseProjectId(`user:${teamA}`)).toBeNull();
  });
});
