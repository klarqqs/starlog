'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import {
  Button,
  Column,
  DataColumn,
  DataTable,
  Dialog,
  DialogTrigger,
  Icon,
  Modal,
  Row,
  Text,
  TextField,
} from '@umami/react-zen';
import { useState } from 'react';
import { DataGrid } from '@/components/common/DataGrid';
import { DateDistance } from '@/components/common/DateDistance';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi, useNavigation } from '@/components/hooks';
import { Ellipsis } from '@/components/icons';
import type { PageResult } from '@/lib/types';

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
};

export function OperatorKeysPage() {
  const { get, post, del, useQuery } = useApi();
  const { query } = useNavigation();
  const [name, setName] = useState('');
  const [createdToken, setCreatedToken] = useState('');
  const keysQuery = useQuery({
    queryKey: ['operator-keys'],
    queryFn: () => get('/admin/operator-keys') as Promise<{ keys: KeyRow[] }>,
  });
  const search = `${query.search || ''}`.trim().toLowerCase();
  const rows = (keysQuery.data?.keys ?? []).filter(key => {
    if (!search) return true;
    return key.name.toLowerCase().includes(search) || key.keyPrefix.toLowerCase().includes(search);
  });
  const tableQuery = {
    ...keysQuery,
    data: keysQuery.data
      ? { data: rows, count: rows.length, page: 1, pageSize: rows.length || 1 }
      : undefined,
  } as UseQueryResult<PageResult<KeyRow[]>, Error>;

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
        </Column>
      </Panel>
      <Panel>
        <DataGrid
          query={tableQuery}
          allowSearch
          allowPaging={false}
          renderEmpty={() => (
            <EmptyCard
              title="No operator keys"
              description="Create a key to read project metrics."
            />
          )}
        >
          {() => (
            <DataTable data={rows}>
              <DataColumn id="name" label="Name">
                {(row: KeyRow) => row.name}
              </DataColumn>
              <DataColumn id="prefix" label="Prefix">
                {(row: KeyRow) => row.keyPrefix}
              </DataColumn>
              <DataColumn id="status" label="Status" width="120px">
                {(row: KeyRow) => (row.revokedAt ? 'Revoked' : 'Active')}
              </DataColumn>
              <DataColumn id="created" label="Created" width="180px">
                {(row: KeyRow) => <DateDistance date={new Date(row.createdAt)} />}
              </DataColumn>
              <DataColumn id="action" label=" " align="end" width="48px">
                {(row: KeyRow) =>
                  row.revokedAt ? null : (
                    <DialogTrigger>
                      <Button variant="quiet" aria-label={`Actions for ${row.name}`}>
                        <Icon>
                          <Ellipsis />
                        </Icon>
                      </Button>
                      <Modal>
                        <Dialog title={row.name} style={{ width: 400 }}>
                          {({ close }) => (
                            <Column gap="4">
                              <Text>
                                Revoke {row.keyPrefix}. The key stops working immediately.
                              </Text>
                              <Row justifyContent="flex-end" gap="2">
                                <Button onPress={close}>Cancel</Button>
                                <Button
                                  variant="danger"
                                  onPress={async () => {
                                    close();
                                    await del(`/admin/operator-keys/${row.id}`);
                                    keysQuery.refetch();
                                  }}
                                >
                                  Revoke
                                </Button>
                              </Row>
                            </Column>
                          )}
                        </Dialog>
                      </Modal>
                    </DialogTrigger>
                  )
                }
              </DataColumn>
            </DataTable>
          )}
        </DataGrid>
      </Panel>
    </Column>
  );
}
