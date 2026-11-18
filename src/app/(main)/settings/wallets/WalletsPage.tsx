'use client';
import { Button, Column, Row, Text } from '@umami/react-zen';
import { useState } from 'react';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi } from '@/components/hooks';
import { signWallet, type WalletId } from '@/components/wallet-client';

export function WalletsPage() {
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
      setNote('Wallet linked.');
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
    <Column gap="6" width="100%">
      <PageHeader title="Wallets">
        <Row gap="2">
          <Button variant="primary" onPress={() => link('freighter')}>
            Link Freighter
          </Button>
          <Button onPress={() => link('xbull')}>Link xBull</Button>
        </Row>
      </PageHeader>
      <Panel width="100%">
        {wallets.length === 0 ? (
          <EmptyCard title="No wallets" description="Link a wallet you already use." />
        ) : (
          <Column gap="3">
            {wallets.map((wallet: { publicKey: string }) => (
              <Row
                key={wallet.publicKey}
                alignItems="center"
                justifyContent="space-between"
                gap="3"
                width="100%"
              >
                <Text truncate>{wallet.publicKey}</Text>
                <Button variant="outline" onPress={() => unlink(wallet.publicKey)}>
                  Remove
                </Button>
              </Row>
            ))}
          </Column>
        )}
        {note ? <Text>{note}</Text> : null}
      </Panel>
    </Column>
  );
}
