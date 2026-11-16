'use client';

import { Column, ListItem, Row, Select, Text } from '@umami/react-zen';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi } from '@/components/hooks';

export function EnrollmentPage() {
  const { get, put, useQuery } = useApi();
  const query = useQuery({
    queryKey: ['enrollment-mode'],
    queryFn: () => get('/admin/enrollment') as Promise<{ mode: 'open' | 'approval-required' }>,
  });

  return (
    <Column gap="6" margin="2">
      <PageHeader title="Enrollment" />
      <Panel>
        <Column gap="3">
          <Text>Choose whether a new project is active immediately or waits for approval.</Text>
          {query.isLoading && <Text>Loading enrollment.</Text>}
          {query.error && <Text>Enrollment could not be loaded.</Text>}
          {query.data && (
            <Row gap="3" alignItems="center">
              <Text>Mode</Text>
              <Select
                aria-label="Enrollment mode"
                value={query.data.mode}
                onChange={async value => {
                  await put('/admin/enrollment', { mode: value });
                  query.refetch();
                }}
              >
                <ListItem id="open">Open</ListItem>
                <ListItem id="approval-required">Approval required</ListItem>
              </Select>
            </Row>
          )}
        </Column>
      </Panel>
    </Column>
  );
}
