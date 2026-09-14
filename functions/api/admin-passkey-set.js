/**
 * Admin Panel passkey: set (first time) or change (must already be
 * unlocked with the current one) the caller's own passkey.
 *
 * POST { passkey } -> {ok:true, expiresAt} and issues a fresh
 * levels_admin_unlock cookie, so setting/changing it also unlocks the
 * panel immediately rather than making the admin re-enter what they
 * just typed.
 */

import { hashPasskey } from '../_lib/passkey.js';
import { signAdminUnlock, adminUnlockCookieHeader } from '../_lib/session.js';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
});

const workerOrigin = (env) => {
  if (!env.SERVER_STATUS_URL) return null;
  try {
    return new URL(env.SERVER_STATUS_URL).origin;
  } catch {
    return null;
  }
};

const MIN_PASSKEY_LENGTH = 6;

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);
  if (!env.PARKED_KV) return json({ error: 'Passkey storage is not configured' }, 503);

  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const passkey = typeof body?.passkey === 'string' ? body.passkey : '';
  if (passkey.length < MIN_PASSKEY_LENGTH) {
    return json({ error: `Passkey must be at least ${MIN_PASSKEY_LENGTH} characters.` }, 400);
  }

  // Real admin tier is required either way — this isn't a general
  // "anyone signed in can create a passkey record" endpoint.
  let tier;
  try {
    const target = new URL(`${origin}/admin-tier`);
    target.searchParams.set('steamId', steamId);
    const tierResponse = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const tierData = await tierResponse.json();
    tier = tierData.tier;
  } catch (error) {
    return json({ error: error.message || 'Admin tier lookup failed' }, 502);
  }
  if (!tier) return json({ error: 'Admin access required.' }, 403);

  try {
    const existing = await env.PARKED_KV.get(`admin_passkey:${steamId}`, 'json');
    // A passkey already exists for this admin — changing it requires
    // already being unlocked with the current one first (same shape as
    // "change password" requiring you to already be logged in).
    if (existing && !data.adminUnlocked) {
      return json({ error: 'Enter your current admin passkey to change it.' }, 403);
    }

    const record = { ...(await hashPasskey(passkey)), failedAttempts: 0, lockedUntil: null, setAt: Date.now() };
    await env.PARKED_KV.put(`admin_passkey:${steamId}`, JSON.stringify(record));

    const { token, expiresAt } = await signAdminUnlock(env, steamId);
    return json({ ok: true, expiresAt }, 200, { 'Set-Cookie': adminUnlockCookieHeader(token) });
  } catch (error) {
    console.error('admin-passkey-set failed:', error?.message, error?.stack);
    return json({ error: error.message || 'Setting the passkey failed' }, 502);
  }
}
