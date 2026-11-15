import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json } from '@/lib/response';

export async function GET(request: Request) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const wallets = await prisma.client.wallet.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: 'asc' },
    select: { publicKey: true, createdAt: true },
  });
  return json({ wallets });
}
