'use client';
import { Button, Column, Row, Text } from '@umami/react-zen';
import { useState } from 'react';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi } from '@/components/hooks';
import { signWallet, type WalletId } from '@/components/wallet-client';

export default function WalletsPage() {
  const { get, post, useQuery } = useApi();
  const [note, setNote] = useState('');
  const query = useQuery({
    queryKey: ['wallets'],
    queryFn: () => get('/me/wallets'),
  });
  const wallets = query.data?.wallets || [];

  const link = async (walletId: WalletId) => {
    setNote('');
    try {
      const { signedTxXdr } = await signWallet(walletId);
      await post('/me/wallets/link', { transaction: signedTxXdr });
      setNote('Wallet linked. You can now sign in with it.');
      query.refetch();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not link that wallet.');
    }
  };

  const unlink = async (address: string) => {
    setNote('');
    try {
      await post('/me/wallets/unlink', { address });
      query.refetch();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not remove that wallet.');
    }
  };

  return (
    <PageBody>
      <Column gap="6">
        <PageHeader title="Wallets" />
        <Panel>
          <Column gap="4" padding="4">
            <Text>
              Link Freighter or xBull after you are signed in. Signing a challenge proves you hold the key. Nothing is sent to the Stellar network.
            </Text>
            <Row gap="2">
              <Button onPress={() => link('freighter')}>Link Freighter</Button>
              <Button onPress={() => link('xbull')}>Link xBull</Button>
            </Row>
            {wallets.length === 0 && <Text>No wallet linked yet.</Text>}
            {wallets.map((wallet: { publicKey: string }) => (
              <Row key={wallet.publicKey} alignItems="center" justifyContent="space-between" gap="3">
                <Text>{wallet.publicKey}</Text>
                <Button variant="quiet" onPress={() => unlink(wallet.publicKey)}>
                  Remove
                </Button>
              </Row>
            ))}
            {note && <Text>{note}</Text>}
          </Column>
        </Panel>
      </Column>
    </PageBody>
  );
}
