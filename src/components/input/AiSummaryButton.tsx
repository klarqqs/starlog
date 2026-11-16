'use client';

import { Button, Column, DataColumn, DataTable, Heading, Row, Text } from '@umami/react-zen';
import { useEffect, useState } from 'react';
import { Panel } from '@/components/common/Panel';
import { useApi, useDateRange } from '@/components/hooks';
import { useProjectDateRange } from '@/components/hooks/useProjectDateRange';
import { DialogButton } from '@/components/input/DialogButton';
import type { AiSummary, SummaryScope } from '@/stellog/summary-text';

export function AiSummaryButton({ scope, websiteId }: { scope: SummaryScope; websiteId?: string }) {
  const [open, setOpen] = useState(false);
  const project = useProjectDateRange();
  const { dateRange } = useDateRange();
  const range = scope === 'overview' || scope === 'apis' ? project.range : dateRange;

  return (
    <>
      <Button variant="outline" onPress={() => setOpen(true)}>
        <AiIcon />
        AI Summary
      </Button>
      <DialogButton
        isOpen={open}
        onOpenChange={setOpen}
        title={
          <Row alignItems="center" gap="2">
            <AiIcon />
            AI Summary
          </Row>
        }
        width="720px"
        minWidth="320px"
      >
        {open && range && (
          <SummaryBody
            scope={scope}
            websiteId={websiteId}
            startAt={range.startDate.getTime()}
            endAt={range.endDate.getTime()}
          />
        )}
      </DialogButton>
    </>
  );
}

function AiIcon() {
  return (
    <img
      alt=""
      src={`${process.env.basePath || ''}/images/ai.png`}
      width={16}
      height={16}
      style={{ marginRight: 6, verticalAlign: 'text-bottom' }}
    />
  );
}

function SummaryTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <Panel>
      <DataTable
        data={rows.map((row, index) => ({
          id: String(index),
          ...Object.fromEntries(columns.map((column, cell) => [column, row[cell] ?? ''])),
        }))}
      >
        {columns.map(column => (
          <DataColumn key={column} id={column} label={column}>
            {(row: Record<string, string>) => row[column]}
          </DataColumn>
        ))}
      </DataTable>
    </Panel>
  );
}

function SummaryBody({
  scope,
  websiteId,
  startAt,
  endAt,
}: {
  scope: SummaryScope;
  websiteId?: string;
  startAt: number;
  endAt: number;
}) {
  const { post } = useApi();
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [message, setMessage] = useState('Writing the summary…');

  useEffect(() => {
    let current = true;
    post('/ai/summary', { scope, websiteId, startAt, endAt })
      .then(data => {
        if (current) setSummary(data as AiSummary);
      })
      .catch(error => {
        if (current) setMessage(error instanceof Error ? error.message : 'The summary failed.');
      });
    return () => {
      current = false;
    };
  }, [post, scope, websiteId, startAt, endAt]);

  if (!summary) {
    return <Text color="muted">{message}</Text>;
  }

  const peak = Math.max(...(summary.bars ?? []).map(bar => bar.value), 1);

  return (
    <Column gap="4">
      <Heading size="lg">{summary.headline}</Heading>
      {summary.paragraphs.map(paragraph => (
        <Text key={paragraph}>{paragraph}</Text>
      ))}
      {summary.table && <SummaryTable columns={summary.table.columns} rows={summary.table.rows} />}
      {summary.bars && summary.bars.length > 0 && (
        <Panel>
          <Column gap="3">
            {summary.bars.map(bar => (
              <Column key={bar.label} gap="1">
                <Row justifyContent="space-between">
                  <Text>{bar.label}</Text>
                  <Text>{bar.value.toLocaleString()}</Text>
                </Row>
                <div
                  style={{
                    height: 8,
                    borderRadius: 4,
                    background: 'var(--color-fill-subtle, rgba(255,255,255,0.08))',
                  }}
                >
                  <div
                    style={{
                      height: 8,
                      width: `${Math.max(4, Math.round((bar.value / peak) * 100))}%`,
                      borderRadius: 4,
                      background: 'var(--color-primary, #2680eb)',
                    }}
                  />
                </div>
              </Column>
            ))}
          </Column>
        </Panel>
      )}
    </Column>
  );
}
