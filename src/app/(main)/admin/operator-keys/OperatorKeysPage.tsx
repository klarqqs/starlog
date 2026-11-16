'use client';

import { Button, Column, Row, Text, TextField } from '@umami/react-zen';
import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi } from '@/components/hooks';

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  revokedAt: string | null;
};

export function OperatorKeysPage() {
  const { get, post, del, useQuery } = useApi();
  const [name, setName] = useState('');
  const [createdToken, setCreatedToken] = useState('');
  const keysQuery = useQuery({
    queryKey: ['operator-keys'],
    queryFn: () => get('/admin/operator-keys') as Promise<{ keys: KeyRow[] }>,
  });

  return (
    <Column gap="6" margin="2">
      <PageHeader title="Operator keys" />
      <Panel>
        <Column gap="3">
          <Text>
            A key can read project metrics. It cannot change enrollment or remove a project.
          </Text>
          <Row gap="2">
            <TextField
              aria-label="Key name"
              value={name}
              placeholder="Key name"
              onChange={setName}
            />
            <Button
              variant="primary"
              isDisabled={!name.trim()}
              onPress={async () => {
                const created = (await post('/admin/operator-keys', { name: name.trim() })) as {
                  token: string;
                };
                setCreatedToken(created.token);
                setName('');
                keysQuery.refetch();
              }}
            >
              Create key
            </Button>
          </Row>
          {createdToken && (
            <Column gap="1">
              <Text>Copy this key now. It is stored only as a hash.</Text>
              <TextField aria-label="New operator key" value={createdToken} isReadOnly allowCopy />
            </Column>
          )}
          {keysQuery.data?.keys.map(key => (
            <Row key={key.id} justifyContent="space-between" alignItems="center">
              <Text>
                {key.name} · {key.keyPrefix} · {key.revokedAt ? 'revoked' : 'active'}
              </Text>
              {!key.revokedAt && (
                <Button
                  variant="quiet"
                  onPress={async () => {
                    await del(`/admin/operator-keys/${key.id}`);
                    keysQuery.refetch();
                  }}
                >
                  Revoke
                </Button>
              )}
            </Row>
          ))}
        </Column>
      </Panel>
    </Column>
  );
}
