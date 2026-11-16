const HASH = /^[a-f0-9]{64}$/;

export const LEDGER_EVENTS = [
  'wallet_created',
  'trustline_added',
  'tx_received',
  'tx_sent',
] as const;

export type LedgerEventName = (typeof LEDGER_EVENTS)[number];

const TITLES: Record<LedgerEventName, string> = {
  wallet_created: 'Wallet created',
  trustline_added: 'Trustline added',
  tx_received: 'Payment received',
  tx_sent: 'Payment sent',
};

export function ledgerTitle(name: string) {
  return TITLES[name as LedgerEventName] ?? name;
}

/** Stellar Expert page for a reported transaction. A hash that is not 64 hex characters has no page. */
export function ledgerExplorerUrl(network: string, hash: string) {
  const value = hash.trim().toLowerCase();
  if (!HASH.test(value)) return null;
  if (network === 'testnet') return `https://stellar.expert/explorer/testnet/tx/${value}`;
  if (network === 'mainnet') return `https://stellar.expert/explorer/public/tx/${value}`;
  return null;
}
