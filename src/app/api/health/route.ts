import prisma from '@/lib/prisma';
import { json } from '@/lib/response';

export async function GET() {
  try {
    await prisma.client.$queryRaw`SELECT 1`;
    return json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
