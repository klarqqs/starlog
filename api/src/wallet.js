import { Keypair, StrKey } from '@stellar/stellar-sdk';

export function validPublicKey(key) {
  return typeof key === 'string' && StrKey.isValidEd25519PublicKey(key);
}

// Freighter and xBull both return a SEP-53 signature: base64 of the 64-byte signature
// over SHA-256("Stellar Signed Message:\n" + message).
export function verifySignedMessage(publicKey, message, signatureB64) {
  if (!validPublicKey(publicKey) || typeof message !== 'string' || typeof signatureB64 !== 'string') return false;
  const signature = Buffer.from(signatureB64, 'base64');
  if (signature.length !== 64) return false;
  try { return Keypair.fromPublicKey(publicKey).verifyMessage(message, signature); }
  catch { return false; }
}
