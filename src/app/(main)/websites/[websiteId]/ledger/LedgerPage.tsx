'use client';

import { Column, DataColumn, DataTable, Row, Text } from '@umami/react-zen';
import { useEffect, useState } from 'react';
import { WebsiteControls } from '@/app/(main)/websites/[websiteId]/WebsiteControls';
import { AssetLabel } from '@/components/common/AssetLabel';
import { DateDistance } from '@/components/common/DateDistance';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Pager } from '@/components/common/Pager';
import { Panel } from '@/components/common/Panel';
import { useApi, useDateParameters } from '@/components/hooks';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import type { LedgerRow } from '@/stellog/ledger';

const oneLine = { whiteSpace: 'nowrap' } as const;
const PAGE_SIZE = 10;

export function LedgerPage({ websiteId }: { websiteId: string }) {
  return (
    <Column gap="3">
      <WebsiteControls websiteId={websiteId} />
      <LedgerReports websiteId={websiteId} />
    </Column>
  );
}

/** Wallet, trustline, and payment reports for the open project or all projects. */
export function LedgerReports({
  websiteId,
  startAt: startProp,
  endAt: endProp,
}: {
  websiteId?: string;
  startAt?: number;
  endAt?: number;
}) {
  const { get, useQuery } = useApi();
  const { startAt: rangeStart, endAt: rangeEnd } = useDateParameters();
  const [page, setPage] = useState(1);
  const startAt = startProp ?? rangeStart;
  const endAt = endProp ?? rangeEnd;

  useEffect(() => {
    setPage(1);
  }, [websiteId, startAt, endAt]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['ledger', websiteId || 'all', startAt, endAt],
    queryFn: () =>
      get(websiteId ? `/websites/${websiteId}/ledger` : '/me/ledger', {
        startAt,
        endAt,
      }) as Promise<LedgerRow[]>,
  });
  const rows = data ?? [];
  const maxPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), maxPage);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <Column gap="3">
      {!isLoading && (
        <MetricsBar>
          <MetricCard label="Wallets" value={count(rows, 'wallet_created')} />
          <MetricCard label="Trustlines" value={count(rows, 'trustline_added')} />
          <MetricCard label="Received" value={count(rows, 'tx_received')} />
          <MetricCard label="Sent" value={count(rows, 'tx_sent')} />
        </MetricsBar>
      )}
      <Panel title="Ledger">
        <LoadingPanel
          data={rows}
          isLoading={isLoading}
          error={error}
          isEmpty={rows.length === 0}
          renderEmpty={() => (
            <EmptyCard title="No ledger" description="No ledger reports in this range." />
          )}
        >
          <div style={{ overflowX: 'auto' }}>
            <DataTable data={pageRows} style={{ minWidth: 920 }}>
              <DataColumn id="title" label="Activity" width="minmax(160px, 1.4fr)" style={oneLine}>
                {(row: LedgerRow) => row.title}
              </DataColumn>
              <DataColumn id="network" label="Network" width="minmax(100px, 0.8fr)" style={oneLine}>
                {(row: LedgerRow) => networkLabel(row.network)}
              </DataColumn>
              <DataColumn id="asset" label="Asset" width="minmax(100px, 0.7fr)" style={oneLine}>
                {(row: LedgerRow) => <AssetLabel asset={row.asset} />}
              </DataColumn>
              <DataColumn id="success" label="Result" width="minmax(100px, 0.7fr)" style={oneLine}>
                {(row: LedgerRow) => resultLabel(row.success)}
              </DataColumn>
              <DataColumn
                id="hash"
                label="Transaction"
                width="minmax(180px, 1.2fr)"
                style={oneLine}
              >
                {(row: LedgerRow) => <HashLink row={row} />}
              </DataColumn>
              <DataColumn
                id="createdAt"
                label="When"
                align="end"
                width="minmax(120px, 0.8fr)"
                style={oneLine}
              >
                {(row: LedgerRow) => <DateDistance date={new Date(row.createdAt)} />}
              </DataColumn>
            </DataTable>
          </div>
          {rows.length > PAGE_SIZE && (
            <Row marginTop="4">
              <Pager
                page={currentPage}
                pageSize={PAGE_SIZE}
                count={rows.length}
                onPageChange={setPage}
              />
            </Row>
          )}
        </LoadingPanel>
      </Panel>
    </Column>
  );
}

function count(rows: LedgerRow[], name: LedgerRow['name']) {
  return rows.filter(row => row.name === name).length;
}

function networkLabel(network: string) {
  if (network === 'testnet') return 'Testnet';
  if (network === 'mainnet') return 'Mainnet';
  return '—';
}

function resultLabel(success: string) {
  if (success === 'true') return 'Succeeded';
  if (success === 'false') return 'Failed';
  return '—';
}

function HashLink({ row }: { row: LedgerRow }) {
  if (!row.hash) return <Text>—</Text>;
  const label = `${row.hash.slice(0, 8)}…${row.hash.slice(-6)}`;
  if (!row.url) return <Text>{label}</Text>;
  return (
    <a href={row.url} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}
