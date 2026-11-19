'use client';

import { Button, Column, Grid, Label, ListItem, Row, Select, TextField } from '@umami/react-zen';
import { useState, type ReactNode } from 'react';
import { useMessages, useMobile } from '@/components/hooks';
import { ListFilter } from '@/components/icons';
import { DialogButton } from '@/components/input/DialogButton';
import { FilterChip } from '@/components/input/FilterChip';
import styles from '@/components/input/WebsiteFilterButton.module.css';
import {
  type FilterDraft,
  type FilterQuery,
  FILTER_PARAM_KEYS,
  activeFilterChips,
  draftFromQuery,
  emptyDraft,
  queryFromDraft,
} from '@/stellog/project-list-filters';

export function ProjectListFilter({
  query,
  onApply,
}: {
  query: FilterQuery;
  onApply: (params: ReturnType<typeof queryFromDraft>) => void;
}) {
  const { t, labels } = useMessages();
  const count = activeFilterChips(query).length;
  const label = count ? `${t(labels.filter)} · ${count}` : t(labels.filter);

  return (
    <DialogButton
      icon={<ListFilter />}
      label={label}
      title={t(labels.filter)}
      variant="outline"
      dialogClassName={`${styles.dialog} stellog-filter-dialog`}
    >
      {({ close }) => (
        <ProjectFilterForm
          query={query}
          onApply={params => {
            onApply(params);
            close();
          }}
        />
      )}
    </DialogButton>
  );
}

export function ProjectFilterChips({
  query,
  onApply,
  onClear,
}: {
  query: FilterQuery;
  onApply: (params: ReturnType<typeof queryFromDraft>) => void;
  onClear: () => void;
}) {
  const chips = activeFilterChips(query);
  if (!chips.length) return null;

  return (
    <Row alignItems="center" justifyContent="space-between" gap="3" wrap="wrap">
      <Row alignItems="center" gap="2" wrap="wrap">
        {chips.map(chip => (
          <FilterChip
            key={chip.key}
            name={chip.key}
            label={chip.label}
            operator={chip.operator}
            value={chip.value}
            onRemove={key => {
              const next = Object.fromEntries(FILTER_PARAM_KEYS.map(name => [name, query[name]])) as ReturnType<
                typeof queryFromDraft
              >;
              onApply({ ...next, [key]: undefined });
            }}
          />
        ))}
      </Row>
      <Button variant="quiet" onPress={onClear}>
        Clear all
      </Button>
    </Row>
  );
}

function ProjectFilterForm({
  query,
  onApply,
}: {
  query: FilterQuery;
  onApply: (params: ReturnType<typeof queryFromDraft>) => void;
}) {
  const { isMobile } = useMobile();
  const [draft, setDraft] = useState<FilterDraft>(() => draftFromQuery(query));
  const patch = (next: Partial<FilterDraft>) => setDraft(current => ({ ...current, ...next }));

  return (
    <Column width={isMobile ? 'auto' : '520px'} gap="5" style={{ flex: 1, minHeight: 0 }}>
      <Column gap="4" style={{ overflowY: 'auto', minHeight: 0 }}>
        <Field label="Properties">
          <Grid columns={{ base: '1fr', md: '140px 1fr' }} gap="2">
            <Select
              aria-label="Properties operator"
              value={draft.sourceOp}
              onChange={value => patch({ sourceOp: String(value) === 'neq' ? 'neq' : 'eq' })}
            >
              <ListItem id="eq">is</ListItem>
              <ListItem id="neq">is not</ListItem>
            </Select>
            <Select
              aria-label="Properties"
              value={draft.source || 'all'}
              onChange={value => {
                const next = String(value);
                patch({ source: next === 'site' || next === 'api' || next === 'both' ? next : '' });
              }}
            >
              <ListItem id="all">All</ListItem>
              <ListItem id="site">Site only</ListItem>
              <ListItem id="api">API only</ListItem>
              <ListItem id="both">Both</ListItem>
            </Select>
          </Grid>
        </Field>
        <PresetField
          label="Error rate"
          preset={draft.errorPreset || 'all'}
          options={[
            ['all', 'All'],
            ['lt0.5', 'Under 0.5%'],
            ['mid', '0.5–1%'],
            ['gt1', 'Over 1%'],
            ['custom', 'Custom'],
          ]}
          onPreset={value =>
            patch({ errorPreset: value === 'all' ? '' : (value as FilterDraft['errorPreset']) })
          }
          custom={draft.errorPreset === 'custom'}
          operator={draft.errorOp}
          onOperator={value => patch({ errorOp: value })}
          min={draft.errorMin}
          max={draft.errorMax}
          onMin={value => patch({ errorMin: value })}
          onMax={value => patch({ errorMax: value })}
          unit="%"
        />
        <PresetField
          label="p95 latency"
          preset={draft.p95Preset || 'all'}
          options={[
            ['all', 'All'],
            ['lt100', 'Under 100 ms'],
            ['mid', '100–150 ms'],
            ['gt150', 'Over 150 ms'],
            ['custom', 'Custom'],
          ]}
          onPreset={value => patch({ p95Preset: value === 'all' ? '' : (value as FilterDraft['p95Preset']) })}
          custom={draft.p95Preset === 'custom'}
          operator={draft.p95Op}
          onOperator={value => patch({ p95Op: value })}
          min={draft.p95Min}
          max={draft.p95Max}
          onMin={value => patch({ p95Min: value })}
          onMax={value => patch({ p95Max: value })}
          unit="ms"
        />
        <Field label="Trend">
          <Select
            aria-label="Trend"
            value={draft.trendPreset || 'all'}
            onChange={value => {
              const next = String(value);
              patch({ trendPreset: next === 'all' ? '' : (next as FilterDraft['trendPreset']) });
            }}
          >
            <ListItem id="all">All</ListItem>
            <ListItem id="up">Growing</ListItem>
            <ListItem id="flat">Flat</ListItem>
            <ListItem id="down">Declining</ListItem>
            <ListItem id="custom">Custom range</ListItem>
          </Select>
          {draft.trendPreset === 'custom' && (
            <Grid columns="1fr 1fr" gap="2">
              <TextField
                aria-label="Minimum trend percent"
                value={draft.trendMin}
                placeholder="Minimum %"
                onChange={value => patch({ trendMin: value })}
              />
              <TextField
                aria-label="Maximum trend percent"
                value={draft.trendMax}
                placeholder="Maximum %"
                onChange={value => patch({ trendMax: value })}
              />
            </Grid>
          )}
        </Field>
        <RangeField
          label="Pageviews"
          min={draft.pageviewMin}
          max={draft.pageviewMax}
          onMin={value => patch({ pageviewMin: value })}
          onMax={value => patch({ pageviewMax: value })}
        />
        <RangeField
          label="API requests"
          min={draft.requestMin}
          max={draft.requestMax}
          onMin={value => patch({ requestMin: value })}
          onMax={value => patch({ requestMax: value })}
        />
      </Column>
      <Row alignItems="center" justifyContent="space-between" gap>
        <Button
          onPress={() => {
            setDraft(emptyDraft());
          }}
        >
          Clear all
        </Button>
        <Button
          variant="primary"
          onPress={() => onApply(queryFromDraft(draft))}
        >
          Apply
        </Button>
      </Row>
    </Column>
  );
}

function PresetField({
  label,
  preset,
  options,
  onPreset,
  custom,
  operator,
  onOperator,
  min,
  max,
  onMin,
  onMax,
  unit,
}: {
  label: string;
  preset: string;
  options: [string, string][];
  onPreset: (value: string) => void;
  custom: boolean;
  operator: 'gt' | 'lt' | 'between';
  onOperator: (value: 'gt' | 'lt' | 'between') => void;
  min: string;
  max: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
  unit: string;
}) {
  return (
    <Field label={label}>
      <Select aria-label={label} value={preset} onChange={value => onPreset(String(value))}>
        {options.map(([id, text]) => (
          <ListItem key={id} id={id}>
            {text}
          </ListItem>
        ))}
      </Select>
      {custom && (
        <Grid columns={{ base: '1fr', md: operator === 'between' ? '140px 1fr 1fr' : '140px 1fr' }} gap="2">
          <Select
            aria-label={`${label} operator`}
            value={operator}
            onChange={value => onOperator(value === 'gt' || value === 'between' ? value : 'lt')}
          >
            <ListItem id="lt">&lt;</ListItem>
            <ListItem id="gt">&gt;</ListItem>
            <ListItem id="between">between</ListItem>
          </Select>
          <TextField
            aria-label={operator === 'between' ? `Minimum ${label}` : label}
            value={min}
            placeholder={operator === 'between' ? `Min ${unit}` : unit}
            onChange={onMin}
          />
          {operator === 'between' && (
            <TextField
              aria-label={`Maximum ${label}`}
              value={max}
              placeholder={`Max ${unit}`}
              onChange={onMax}
            />
          )}
        </Grid>
      )}
    </Field>
  );
}

function RangeField({
  label,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string;
  min: string;
  max: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Grid columns="1fr 1fr" gap="2">
        <TextField aria-label={`Minimum ${label}`} value={min} placeholder="Minimum" onChange={onMin} />
        <TextField aria-label={`Maximum ${label}`} value={max} placeholder="Maximum" onChange={onMax} />
      </Grid>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Column gap="1">
      <Label>{label}</Label>
      {children}
    </Column>
  );
}

