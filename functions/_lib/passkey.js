/**
 * Password-style hash + verify for the Admin Panel's passkey, PBKDF2-SHA256
 * via Web Crypto — no new dependency, same reasoning as the HMAC session
 * signing in session.js, but a different primitive (hash+verify against a
 * per-admin secret, not sign+verify of a server-issued token).
 */

const encoder = new TextEncoder();
const ITERATIONS = 100000;
const HASH_BITS = 256;

const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const derive = async (passkey, saltBytes, iterations) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(passkey), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    key,
    HASH_BITS,
  );
  return toB64(bits);
};

// Called once, when an admin sets or changes their passkey.
export async function hashPasskey(passkey) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hashB64 = await derive(passkey, saltBytes, ITERATIONS);
  return { saltB64: toB64(saltBytes), hashB64, iterations: ITERATIONS };
}

// Called on every unlock attempt. Re-derives with the stored salt/
// iterations and compares — crypto.subtle itself doesn't expose a
// constant-time byte-array compare, so this XORs every byte rather than
// short-circuiting on the first mismatch (same reasoning HMAC verify
// gets for free via crypto.subtle.verify in session.js).
export async function verifyPasskey(passkey, record) {
  if (!record?.saltB64 || !record?.hashB64 || !record?.iterations) return false;
  const candidateB64 = await derive(passkey, fromB64(record.saltB64), record.iterations);
  const a = fromB64(candidateB64);
  const b = fromB64(record.hashB64);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
