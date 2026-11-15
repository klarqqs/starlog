'use client';

export type WalletId = 'freighter' | 'xbull';

declare global {
  interface Window {
    StarlogWallet?: {
      signChallenge: (
        walletId: WalletId,
        challengeFor: (address: string) => Promise<string>,
        networkPassphrase: string,
      ) => Promise<{ address: string; signedTxXdr: string }>;
    };
  }
}

export function loadWalletScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.StarlogWallet) return Promise.resolve();
  const existing = document.querySelector('script[data-starlog-wallet]');
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load the wallet signer.')));
    });
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/wallet.js';
    script.dataset.starlogWallet = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the wallet signer.'));
    document.head.appendChild(script);
  });
}

export async function signWallet(walletId: WalletId) {
  await loadWalletScript();
  const config = await fetch('/api/auth/wallet/config').then(r => r.json());
  if (!config.enabled) throw new Error('Wallet sign-in is not enabled on this server.');
  if (!window.StarlogWallet) throw new Error('The wallet signer did not load.');
  return window.StarlogWallet.signChallenge(
    walletId,
    async address => {
      const res = await fetch('/api/auth/wallet/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Could not start wallet sign-in.');
      return data.transaction as string;
    },
    config.networkPassphrase,
  );
}
