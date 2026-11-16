'use client';
import { Button, Column, Heading, Row, Text, TextField } from '@umami/react-zen';
import { useEffect, useState } from 'react';
import { Empty } from '@/components/common/Empty';
import { useLoginQuery } from '@/components/hooks';
import { useApi } from '@/components/hooks/useApi';
import { isReadOnlyOperator } from '@/stellog/project-nav';

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  revokedAt: string | null;
  rotatedFromId: string | null;
};

export function WebsiteIngestKeys({
  websiteId,
  compact = false,
}: {
  websiteId: string;
  compact?: boolean;
}) {
  const { user } = useLoginQuery();
  const readOnly = isReadOnlyOperator(user);
  const { get, post, del } = useApi();
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [name, setName] = useState('production');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function reload() {
    const rows = (await get(`/websites/${websiteId}/ingest-keys`)) as KeyRow[];
    setKeys(rows);
  }

  useEffect(() => {
    reload().catch(cause =>
      setError(cause instanceof Error ? cause.message : 'Could not load keys.'),
    );
  }, [websiteId]);

  async function createKey() {
    setError(null);
    setPending(true);
    try {
      const created = (await post(`/websites/${websiteId}/ingest-keys`, { name })) as {
        token: string;
      };
      setToken(created.token);
      await reload();
    } finally {
      setPending(false);
    }
  }

  async function rotate(keyId: string) {
    setError(null);
    const created = (await post(`/websites/${websiteId}/ingest-keys/${keyId}/rotate`)) as {
      token: string;
    };
    setToken(created.token);
    await reload();
  }

  async function revoke(keyId: string) {
    setError(null);
    await del(`/websites/${websiteId}/ingest-keys/${keyId}`);
    setToken(null);
    await reload();
  }

  const active = keys.filter(key => !key.revokedAt);

  return (
    <Column gap="4">
      {compact ? null : (
        <>
          <Heading>API ingest key</Heading>
          <Text color="muted">
            The key belongs to this website’s team. Send tenant.id or a service.name that matches a
            website name in the team.
          </Text>
        </>
      )}
      {readOnly ? null : (
        <Row gap="3" alignItems="center">
          <TextField
            value={name}
            onChange={setName}
            aria-label="Key name"
            placeholder="production"
            style={{ flex: 1 }}
          />
          <Button
            variant="primary"
            onPress={() => createKey().catch(showError)}
            isDisabled={pending || !name.trim()}
          >
            Create key
          </Button>
        </Row>
      )}
      {token ? (
        <Column gap="2">
          <Text color="muted">Copy this token now. It is not shown again.</Text>
          <TextField value={token} isReadOnly allowCopy asTextArea className="code-textarea" />
        </Column>
      ) : null}
      {error ? <Text>{error}</Text> : null}
      {active.length === 0 ? (
        <Empty />
      ) : (
        <Column gap="3">
          {active.map(key => (
            <Row key={key.id} alignItems="center" justifyContent="space-between" gap="3">
              <Column gap="1">
                <Text weight="bold">{key.name}</Text>
                <Text color="muted">
                  {key.keyPrefix}
                  {key.rotatedFromId ? ' · rotated' : ''}
                </Text>
              </Column>
              {readOnly ? null : (
                <Row gap="2">
                  <Button variant="outline" onPress={() => rotate(key.id).catch(showError)}>
                    Rotate
                  </Button>
                  <Button variant="outline" onPress={() => revoke(key.id).catch(showError)}>
                    Revoke
                  </Button>
                </Row>
              )}
            </Row>
          ))}
        </Column>
      )}
    </Column>
  );

  function showError(cause: unknown) {
    setError(cause instanceof Error ? cause.message : 'Request failed.');
  }
}
