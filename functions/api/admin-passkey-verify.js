/**
 * Admin Panel passkey: unlock with an already-set passkey.
 *
 * POST { passkey } -> {ok:true, expiresAt} and issues a fresh
 * levels_admin_unlock cookie (35 minutes — see functions/_lib/session.js's
 * ADMIN_UNLOCK_TTL_MS). Five wrong attempts locks the account out of
 * further attempts for 5 minutes, tracked on the same KV record.
 */

import { verifyPasskey } from '../_lib/passkey.js';
import { signAdminUnlock, adminUnlockCookieHeader } from '../_lib/session.js';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);
  if (!env.PARKED_KV) return json({ error: 'Passkey storage is not configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const passkey = typeof body?.passkey === 'string' ? body.passkey : '';
  if (!passkey) return json({ error: 'Enter your passkey.' }, 400);

  try {
    const record = await env.PARKED_KV.get(`admin_passkey:${steamId}`, 'json');
    if (!record) return json({ error: 'No passkey set yet.' }, 404);

    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      const minutesLeft = Math.ceil((record.lockedUntil - Date.now()) / 60000);
      return json({ error: `Too many wrong attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.` }, 429);
    }

    const valid = await verifyPasskey(passkey, record);
    if (!valid) {
      const failedAttempts = (record.failedAttempts || 0) + 1;
      const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
      await env.PARKED_KV.put(`admin_passkey:${steamId}`, JSON.stringify({
        ...record,
        failedAttempts: lockedUntil ? 0 : failedAttempts,
        lockedUntil,
      }));
      return json({
        error: lockedUntil
          ? `Too many wrong attempts. Try again in ${Math.ceil(LOCKOUT_MS / 60000)} minutes.`
          : 'Wrong passkey.',
      }, lockedUntil ? 429 : 401);
    }

    if (record.failedAttempts || record.lockedUntil) {
      await env.PARKED_KV.put(`admin_passkey:${steamId}`, JSON.stringify({ ...record, failedAttempts: 0, lockedUntil: null }));
    }

    const { token, expiresAt } = await signAdminUnlock(env, steamId);
    const cookieHeader = adminUnlockCookieHeader(token);
    console.log('admin-passkey-verify debug:', JSON.stringify({ steamId, expiresAt, cookieHeaderLength: cookieHeader.length, hasSessionSecret: !!env.SESSION_SECRET }));
    return json({ ok: true, expiresAt }, 200, { 'Set-Cookie': cookieHeader });
  } catch (error) {
    return json({ error: error.message || 'Passkey verification failed' }, 502);
  }
}
