import { hash, secret } from '@/lib/crypto';
import { getIpAddress } from '@/lib/ip';
import { fetchWebsite } from '@/lib/load';
import { decideCollect, type IpBudget, issueNonce } from '@/stellog/collect-guard';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-cache',
};

const budgets: IpBudget = new Map();

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(request: Request) {
  const websiteId = new URL(request.url).searchParams.get('id');
  if (!websiteId) return json({ message: 'Rejected.' }, 400);
  const website = await fetchWebsite(websiteId);
  if (!website) return json({ message: 'Rejected.' }, 400);
  return json({ nonce: issueNonce(secret(), websiteId, Date.now()) });
}

export async function POST(request: Request) {
  const raw = await request.text();
  let body: { payload?: { website?: string; nonce?: string } } = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ message: 'Rejected.' }, 400);
  }

  const websiteId = body.payload?.website || null;
  const website = websiteId ? await fetchWebsite(websiteId) : null;
  const ip = getIpAddress(request.headers) || 'unknown';
  const decision = decideCollect(
    {
      now: Date.now(),
      secret: secret(),
      websiteId: website ? websiteId : null,
      domain: website?.domain ?? null,
      nonce: body.payload?.nonce ?? null,
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
      userAgent: request.headers.get('user-agent'),
      ipHash: hash(ip, secret()),
    },
    budgets,
  );

  if (!decision.ok) {
    if (decision.reason === 'bot') return json({ beep: 'boop' }, 200);
    const status = decision.reason === 'budget' ? 429 : decision.status;
    return json({ message: 'Rejected.' }, status);
  }

  const headers = new Headers(request.headers);
  const cache = headers.get('x-stellog-cache');
  if (cache && !headers.get('x-umami-cache')) headers.set('x-umami-cache', cache);
  const { POST: send } = await import('@/app/api/send/route');
  const response = await send(new Request(request.url, { method: 'POST', headers, body: raw }));
  for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
  return response;
}

function json(body: Record<string, string>, status = 200) {
  return Response.json(body, { status, headers: cors });
}
