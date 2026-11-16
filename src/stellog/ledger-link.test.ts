import { expect, test } from 'vitest';
import { ledgerExplorerUrl, ledgerTitle } from './ledger-link';

const hash = 'ab'.repeat(32);

test('a testnet hash opens on the testnet explorer', () => {
  expect(ledgerExplorerUrl('testnet', hash)).toBe(
    `https://stellar.expert/explorer/testnet/tx/${hash}`,
  );
});

test('a mainnet hash opens on the public explorer', () => {
  expect(ledgerExplorerUrl('mainnet', hash.toUpperCase())).toBe(
    `https://stellar.expert/explorer/public/tx/${hash}`,
  );
});

test('a short hash has no explorer page', () => {
  expect(ledgerExplorerUrl('mainnet', 'abc')).toBeNull();
});

test('the four reports use the product names', () => {
  expect(ledgerTitle('wallet_created')).toBe('Wallet created');
  expect(ledgerTitle('trustline_added')).toBe('Trustline added');
  expect(ledgerTitle('tx_received')).toBe('Payment received');
  expect(ledgerTitle('tx_sent')).toBe('Payment sent');
});
