import { beforeEach, describe, expect, test, vi } from 'vitest';

process.env.APP_SECRET = 'route-collect-test-secret';

import { POST as sendPost } from '@/app/api/send/route';
import { secret } from '@/lib/crypto';
import { fetchWebsite } from '@/lib/load';
import { issueNonce, verifyNonce } from '@/stellog/collect-guard';
import { GET, POST } from './route';

vi.mock('@/lib/load', () => ({
  fetchWebsite: vi.fn(),
}));

vi.mock('@/app/api/send/route', () => ({
  POST: vi.fn(async () => Response.json({ ok: true })),
}));

const website = vi.mocked(fetchWebsite);
const send = vi.mocked(sendPost);
const websiteId = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  website.mockReset();
  send.mockClear();
  website.mockResolvedValue({ id: websiteId, domain: 'example.com' } as any);
});

function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return POST(
    new Request('http://localhost/s/e', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://example.com',
        'x-forwarded-for': '203.0.113.20',
        'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
        ...headers,
      },
      body: JSON.stringify({ type: 'event', payload: { website: websiteId, ...body } }),
    }),
  );
}

describe('POST /s/e', () => {
  test('does not record a request with a missing nonce or the wrong origin', async () => {
    expect((await post({})).status).toBe(403);
    expect((await post({ nonce: 'bad' }, { origin: 'https://other.test' })).status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });

  test('records a website event that presents a valid nonce and origin', async () => {
    const nonce = issueNonce(secret(), websiteId, Date.now());
    const response = await post(
      { nonce },
      { 'x-forwarded-for': '203.0.113.21', 'x-stellog-cache': 'cache-token' },
    );

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    const forwarded = send.mock.calls[0][0];
    expect(forwarded.headers.get('x-umami-cache')).toBe('cache-token');
    expect(await forwarded.json()).toMatchObject({ payload: { nonce } });
  });

  test('does not record a bot or a link that has no website', async () => {
    const bot = await post(
      { nonce: issueNonce(secret(), websiteId, Date.now()) },
      {
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'x-forwarded-for': '203.0.113.22',
      },
    );
    const link = await POST(
      new Request('http://localhost/s/e', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.23' },
        body: JSON.stringify({ type: 'event', payload: { link: 'link-id' } }),
      }),
    );

    expect(bot.status).toBe(200);
    expect(await bot.json()).toEqual({ beep: 'boop' });
    expect(link.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('GET /s/e', () => {
  test('issues a nonce for a known website', async () => {
    const response = await GET(new Request(`http://localhost/s/e?id=${websiteId}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(verifyNonce(secret(), websiteId, body.nonce, Date.now())).toBe(true);
  });
});
