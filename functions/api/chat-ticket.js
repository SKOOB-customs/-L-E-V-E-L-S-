/**
 * Mints a short-lived (60s) signed ticket for opening the global chat
 * WebSocket. Chat connects directly to the bridge Worker's own
 * workers.dev origin (not this site's own domain — see wrangler.jsonc),
 * so the levels_session cookie never reaches it; this same-origin
 * endpoint sees the cookie, verifies it, and hands back a ticket the
 * Worker can verify on its own using the same shared SESSION_SECRET,
 * without ever trusting a client-supplied steamId directly.
 *
 * GET ?name= -> { ticket }. name is just the display name to show next to
 * messages — not a trust boundary (the ticket's steamId, the thing chat
 * actions actually key off of, comes from the verified session either
 * way), so it's fine to take it as a client-supplied hint.
 */

import { signTicket } from '../_lib/session.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestGet({ request, env, data }) {
  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);
  if (!env.SESSION_SECRET) return json({ error: 'Chat is not configured' }, 503);

  const rawName = new URL(request.url).searchParams.get('name') || steamId;
  const name = rawName.slice(0, 32);

  try {
    const ticket = await signTicket(env, steamId, name);
    return json({ ticket });
  } catch (error) {
    return json({ error: error.message || 'Chat ticket failed' }, 502);
  }
}
