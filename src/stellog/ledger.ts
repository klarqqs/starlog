import prisma from '@/lib/prisma';
import { type LedgerEventName, ledgerExplorerUrl, ledgerTitle } from './ledger-link';

export type LedgerRow = {
  id: string;
  name: LedgerEventName;
  title: string;
  createdAt: string;
  network: string;
  asset: string;
  success: string;
  hash: string;
  url: string | null;
};

/** Wallet, trustline, and payment reports stored for one property. */
export async function readLedger(websiteId: string, start: Date, end: Date): Promise<LedgerRow[]> {
  const rows = await prisma.rawQuery(
    `
    select e.event_id as id,
      e.event_name as name,
      e.created_at as "createdAt",
      max(case when d.data_key = 'network' then d.string_value end) as network,
      max(case when d.data_key = 'asset' then d.string_value end) as asset,
      max(case when d.data_key = 'success' then d.string_value end) as success,
      max(case when d.data_key = 'hash' then d.string_value end) as hash
    from website_event e
    left join event_data d on d.website_event_id = e.event_id
    where e.website_id = {{websiteId}}::uuid
      and e.event_type = 2
      and e.event_name in ('wallet_created', 'trustline_added', 'tx_received', 'tx_sent')
      and e.created_at >= {{start}}
      and e.created_at <= {{end}}
    group by e.event_id, e.event_name, e.created_at
    order by e.created_at desc
    `,
    { websiteId, start, end },
    'websiteLedger',
  );

  return rows.map((row: Record<string, string | Date | null>) => {
    const name = String(row.name);
    const hash = String(row.hash ?? '');
    const network = String(row.network ?? '');
    const created = row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt));
    return {
      id: String(row.id),
      name: name as LedgerEventName,
      title: ledgerTitle(name),
      createdAt: created.toISOString(),
      network,
      asset: String(row.asset ?? ''),
      success: String(row.success ?? ''),
      hash,
      url: ledgerExplorerUrl(network, hash),
    };
  });
}
