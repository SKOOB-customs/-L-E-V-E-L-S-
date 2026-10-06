/**
 * Desktop Overlay pairing, step 2: the overlay app calls this directly
 * (no session cookie exists for it — it's a separate Electron process,
 * not a browser) with the short code shown on the website's Profile tab,
 * and gets back a long-lived overlay token in exchange. The code is
 * single-use: this deletes it from KV immediately on a successful
 * exchange, so it can't be reused even within its 10-minute window.
 *
 * Plain GET with a query param, not POST+JSON — deliberately, so this
 * never triggers a CORS preflight (Electron's renderer is a different
 * origin than the site). Access-Control-Allow-Origin: * is safe here
 * specifically because the code itself is short-lived, single-use, and
 * was only ever shown to the authenticated player who generated it — an
 * attacker would need to have already seen that exact code within its
 * 10-minute window to exchange it.
 *
 * GET ?code= -> { token, steamId }
 */

import { signOverlayToken } from '../_lib/session.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  },
});

export async function onRequestGet({ request, env }) {
  if (!env.PARKED_KV) return json({ error: 'Pairing storage is not configured' }, 503);

  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase();
  if (!code) return json({ error: 'Missing pairing code' }, 400);

  try {
    const key = `overlay_pairing:${code}`;
    const raw = await env.PARKED_KV.get(key);
    if (!raw) return json({ error: 'That code is invalid or has expired. Generate a new one from the website.' }, 404);

    let pairing;
    try {
      pairing = JSON.parse(raw);
    } catch {
      pairing = null;
    }
    if (!pairing?.steamId) return json({ error: 'That code is invalid or has expired. Generate a new one from the website.' }, 404);

    // Delete before responding, not after — makes the code genuinely
    // single-use even if two exchange attempts race each other.
    await env.PARKED_KV.delete(key);

    const token = await signOverlayToken(env, pairing.steamId);
    return json({ token, steamId: pairing.steamId });
  } catch (error) {
    return json({ error: error.message || 'Pairing failed' }, 502);
  }
}
