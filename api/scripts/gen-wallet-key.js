// Prints a new Stellar secret key for signing wallet sign-in challenges (SEP-10 server key).
// It never holds funds and is not used on the network. Keep it secret and set it as STELLAR_AUTH_SECRET.
import { Keypair } from '@stellar/stellar-sdk';
const kp = Keypair.random();
console.log(`STELLAR_AUTH_SECRET=${kp.secret()}`);
console.log(`# public key (safe to share): ${kp.publicKey()}`);
