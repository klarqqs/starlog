'use client';

import { Dialog, Modal } from '@umami/react-zen';
import { useState } from 'react';
import { MetricLabel } from '@/components/metrics/MetricLabel';
import { formatLongNumber } from '@/lib/format';
import { percentFilter } from '@/lib/filters';
import type { Audience } from '@/stellog/project-traffic';

const PREVIEW = 5;

/** Pages, sources, browsers, and countries summed across every project. */
export function OverviewAudience({ audience }: { audience: Audience }) {
  return (
    <div className="stellog-audience">
      <ShareCard title="Top pages" type="path" rows={audience.path} />
      <ShareCard title="Sources" type="referrer" rows={audience.referrer} />
      <ShareCard title="Browsers" type="browser" rows={audience.browser} />
      <ShareCard title="Countries" type="country" rows={audience.country} />
    </div>
  );
}

function ShareCard({
  title,
  type,
  rows,
}: {
  title: string;
  type: string;
  rows: Audience['path'];
}) {
  const [open, setOpen] = useState(false);
  const items = percentFilter(rows).map(({ x, y, z }) => ({ label: x, count: y, percent: z }));
  const shown = items.slice(0, PREVIEW);

  return (
    <section className="stellog-card stellog-share-card">
      <h2>{title}</h2>
      <div className="stellog-share-list">
        {shown.map(row => (
          <ShareRow key={row.label} type={type} row={row} />
        ))}
      </div>
      {items.length > PREVIEW && (
        <button type="button" className="stellog-overview-link stellog-more" onClick={() => setOpen(true)}>
          More
        </button>
      )}
      {open && (
        <Modal placement="center" isOpen={open} onOpenChange={setOpen}>
          <Dialog title={title} style={{ width: 480, maxHeight: 'calc(100dvh - 80px)', overflowY: 'auto' }}>
            <div className="stellog-share-list">
              {items.map(row => (
                <ShareRow key={row.label} type={type} row={row} />
              ))}
            </div>
          </Dialog>
        </Modal>
      )}
    </section>
  );
}

function ShareRow({
  type,
  row,
}: {
  type: string;
  row: { label: string; count: number; percent: number };
}) {
  return (
    <div className="stellog-share" style={{ ['--share' as string]: `${Math.max(row.percent, 2)}%` }}>
      <i />
      <span>
        <MetricLabel type={type} data={row} />
      </span>
      <b>
        {formatLongNumber(row.count)}
        <em>{Math.round(row.percent)}%</em>
      </b>
    </div>
  );
}
