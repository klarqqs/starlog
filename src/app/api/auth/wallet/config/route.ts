import { json } from '@/lib/response';
import { PUBLIC_NETWORK, walletKeyFromEnv } from '@/lib/starlog-accounts';

export async function GET() {
  return json({
    enabled: !!walletKeyFromEnv(),
    networkPassphrase: PUBLIC_NETWORK,
    wallets: ['freighter', 'xbull'],
  });
}
