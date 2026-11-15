import { handleOtlpRequest } from '@/stellog/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleOtlpRequest(request, 'logs');
}
