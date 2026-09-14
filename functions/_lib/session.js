/**
 * Shared helper: signs and verifies the site's session cookie and the
 * short-lived chat ticket, both HMAC-SHA256 (Web Crypto, no dependency —
 * same primitive already used for Discord interaction signature
 * verification elsewhere in this codebase).
 *
 * Steam login only ever proved identity at the moment of login
 * (steam-callback.js verifies the OpenID assertion server-side) — after
 * that, nothing tied a request back to that login; every route just
 * trusted whatever steamId the client claimed in its own request body.
 * This is the one place that changes: steam-callback.js signs a token
 * here and sets it as an HttpOnly cookie, and every route that needs to
 * know "who is actually calling this" reads it back via
 * functions/api/_middleware.js instead of trusting a client-supplied
 * field.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const SESSION_COOKIE_NAME = 'levels_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TICKET_TTL_MS = 60 * 1000; // 60 seconds — just long enough to open the chat socket
const ADMIN_UNLOCK_COOKIE_NAME = 'levels_admin_unlock';
const ADMIN_UNLOCK_TTL_MS = 35 * 60 * 1000; // 35 minutes, per the Admin Panel passkey feature

const base64UrlEncode = (bytes) => {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlDecode = (str) => {
  const normalized = str.replace(/-/g, '+').replace(/\//g, '_');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const importKey = (secret) => crypto.subtle.importKey(
  'raw',
  encoder.encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
);

const signPayload = async (secret, payload) => {
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  return `${payloadB64}.${base64UrlEncode(new Uint8Array(signature))}`;
};

// Verification itself (crypto.subtle.verify) is constant-time — no manual
// comparison needed. Never throws: any malformed/tampered/expired token
// just yields null, same as "no token at all."
const verifyToken = async (secret, token) => {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  if (!payloadB64 || !sigB64) return null;

  let signatureBytes;
  try {
    signatureBytes = base64UrlDecode(sigB64);
  } catch {
    return null;
  }

  const key = await importKey(secret);
  const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(payloadB64));
  if (!valid) return null;

  let payload;
  try {
    payload = JSON.parse(decoder.decode(base64UrlDecode(payloadB64)));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
};

const parseCookie = (cookieHeader, name) => {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
};

// Called once, by steam-callback.js, right after it verifies the OpenID
// assertion — the only moment a steamId is actually proven.
export async function signSession(env, steamId) {
  const now = Date.now();
  return signPayload(env.SESSION_SECRET, { steamId, iat: now, exp: now + SESSION_TTL_MS });
}

export function sessionCookieHeader(token) {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

// Read by functions/api/_middleware.js on every /api/* request — returns
// the verified steamId, or null if there's no session, it's expired, or
// it's been tampered with. Never rejects the request itself; individual
// routes decide whether they require it.
export async function verifySession(env, request) {
  if (!env.SESSION_SECRET) return null;
  const token = parseCookie(request.headers.get('Cookie'), SESSION_COOKIE_NAME);
  if (!token) return null;
  const payload = await verifyToken(env.SESSION_SECRET, token);
  return typeof payload?.steamId === 'string' ? payload.steamId : null;
}

// Chat connects directly to the Worker's workers.dev origin (a different
// origin than the site itself, for reasons unrelated to this — see
// wrangler.jsonc), so the session cookie never reaches it. Instead the
// client fetches one of these short-lived tickets same-origin (where the
// cookie IS visible) and passes it as a query param when opening the
// WebSocket; the Worker verifies it with the same shared SESSION_SECRET.
export async function signTicket(env, steamId, name) {
  const now = Date.now();
  return signPayload(env.SESSION_SECRET, { steamId, name, iat: now, exp: now + TICKET_TTL_MS });
}

export async function verifyTicket(env, ticket) {
  if (!env.SESSION_SECRET) return null;
  const payload = await verifyToken(env.SESSION_SECRET, ticket);
  if (typeof payload?.steamId !== 'string') return null;
  return { steamId: payload.steamId, name: typeof payload.name === 'string' ? payload.name : payload.steamId };
}

// Admin Panel passkey unlock — a second, separate secret from the site
// session above, gating only the Admin Panel. Issued by
// admin-passkey-set.js/admin-passkey-verify.js once an admin's passkey
// checks out; read by functions/api/_middleware.js on every request
// alongside the session cookie so admin-gated routes can require it.
// Never needs to reach the Worker directly — the Worker already fully
// trusts Pages as its only caller (the STATUS_API_TOKEN gate), so Pages
// enforcing this here is the real boundary, same as it already is for
// steamId itself.
// Returns both the token and its expiry so callers (admin-passkey-set.js/
// admin-passkey-verify.js) never have to duplicate ADMIN_UNLOCK_TTL_MS
// themselves — one place controls the actual unlock duration.
export async function signAdminUnlock(env, steamId) {
  const now = Date.now();
  const exp = now + ADMIN_UNLOCK_TTL_MS;
  const token = await signPayload(env.SESSION_SECRET, { steamId, iat: now, exp });
  return { token, expiresAt: exp };
}

export function adminUnlockCookieHeader(token) {
  const maxAgeSeconds = Math.floor(ADMIN_UNLOCK_TTL_MS / 1000);
  return `${ADMIN_UNLOCK_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

// Returns { steamId, expiresAt } (not just a boolean/steamId) so
// admin-status.js can tell the client exactly when the unlock ends —
// needed on an ordinary page load where the cookie already existed, not
// just right after a fresh verify/set call.
export async function verifyAdminUnlock(env, request) {
  if (!env.SESSION_SECRET) return null;
  const token = parseCookie(request.headers.get('Cookie'), ADMIN_UNLOCK_COOKIE_NAME);
  if (!token) return null;
  const payload = await verifyToken(env.SESSION_SECRET, token);
  if (typeof payload?.steamId !== 'string') return null;
  return { steamId: payload.steamId, expiresAt: payload.exp };
}
