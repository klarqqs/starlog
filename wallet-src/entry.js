// Browser side of wallet sign-in. Only Freighter and xBull are bundled, and the result is committed
// as ../wallet.js so the site never loads wallet code from a third-party host.
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { FreighterModule, FREIGHTER_ID } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule, XBULL_ID } from '@creit.tech/stellar-wallets-kit/modules/xbull';

let ready = false;
function init() {
  if (ready) return;
  StellarWalletsKit.init({ modules: [new FreighterModule(), new xBullModule()] });
  ready = true;
}

// Connects the chosen wallet, then asks it to sign the server's challenge transaction.
// The transaction is never sent to the network: it only proves the wallet owner holds the key.
async function signChallenge(walletId, challengeFor, networkPassphrase) {
  init();
  StellarWalletsKit.setWallet(walletId === 'xbull' ? XBULL_ID : FREIGHTER_ID);
  const { address } = await StellarWalletsKit.getAddress();
  const xdr = await challengeFor(address);
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, { networkPassphrase, address });
  return { address, signedTxXdr };
}
window.StarlogWallet = { signChallenge };
