'use client';

import {
  Button,
  Column,
  DataColumn,
  DataTable,
  Heading,
  Row,
  Text,
  TextField,
} from '@umami/react-zen';
import { useEffect, useState } from 'react';
import { Panel } from '@/components/common/Panel';
import { useApi, useDateRange } from '@/components/hooks';
import { useProjectDateRange } from '@/components/hooks/useProjectDateRange';
import { DialogButton } from '@/components/input/DialogButton';
import { getItem, removeItem, setItem } from '@/lib/storage';
import type { AiSummary, SummaryScope } from '@/stellog/summary-text';

const SUMMARY_KEY = 'stellog.xai-key';

export function AiSummaryButton({ scope, websiteId }: { scope: SummaryScope; websiteId?: string }) {
  const [open, setOpen] = useState(false);
  const project = useProjectDateRange();
  const { dateRange } = useDateRange();
  const range = scope === 'overview' || scope === 'apis' ? project.range : dateRange;

  return (
    <>
      <Button variant="outline" onPress={() => setOpen(true)}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <AiIcon />
          Summary
        </span>
      </Button>
      <DialogButton
        isOpen={open}
        onOpenChange={setOpen}
        title={
          <Row alignItems="center" gap="1">
            <AiIcon />
            Summary
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

function KeyPrompt({ message, onSave }: { message?: string; onSave: (key: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <Column gap="3">
      <Text>
        Add your xAI API key to write this summary. It stays in this browser and is sent only for
        the request.
      </Text>
      <TextField
        aria-label="xAI API key"
        type="password"
        value={value}
        autoComplete="off"
        placeholder="xai-…"
        onChange={setValue}
      />
      {message && <Text color="muted">{message}</Text>}
      <Row justifyContent="flex-end">
        <Button
          variant="primary"
          isDisabled={value.trim().length < 20}
          onPress={() => onSave(value.trim())}
        >
          Save key
        </Button>
      </Row>
    </Column>
  );
}

function AiIcon() {
  return (
    <img
      alt=""
      src={`${process.env.basePath || ''}/images/ai.png`}
      width={16}
      height={16}
      style={{ display: 'block' }}
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

function savedKey() {
  const value = getItem(SUMMARY_KEY);
  return typeof value === 'string' ? value : '';
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
  const [apiKey, setApiKey] = useState(savedKey);
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [message, setMessage] = useState('Writing the summary…');

  useEffect(() => {
    if (!apiKey) return;
    let current = true;
    post('/ai/summary', { scope, websiteId, startAt, endAt, apiKey })
      .then(data => {
        if (current) setSummary(data as AiSummary);
      })
      .catch(error => {
        if (!current) return;
        const text = error instanceof Error ? error.message : 'The summary failed.';
        if (/api key/i.test(text)) {
          removeItem(SUMMARY_KEY);
          setApiKey('');
        }
        setMessage(text);
      });
    return () => {
      current = false;
    };
  }, [post, scope, websiteId, startAt, endAt, apiKey]);

  if (!apiKey) {
    return (
      <KeyPrompt
        message={message === 'Writing the summary…' ? '' : message}
        onSave={key => {
          setItem(SUMMARY_KEY, key);
          setMessage('Writing the summary…');
          setSummary(null);
          setApiKey(key);
        }}
      />
    );
  }

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
      <Button
        variant="quiet"
        onPress={() => {
          removeItem(SUMMARY_KEY);
          setApiKey('');
          setSummary(null);
        }}
      >
        Change API key
      </Button>
    </Column>
  );
}
