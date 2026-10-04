/**
 * Mints a short-lived signed ticket for opening the Proximity Voice
 * presence WebSocket (/voice-ws on the bridge Worker) — identical
 * reasoning and mechanism to chat-ticket.js: the Worker's own
 * workers.dev origin never sees the levels_session cookie, so this
 * same-origin endpoint verifies it and hands back a ticket the Worker
 * can verify independently using the shared SESSION_SECRET.
 *
 * GET ?name= -> { ticket }. name is a cosmetic display hint only, same
 * as chat-ticket.js.
 */

import { signTicket } from '../_lib/session.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestGet({ request, env, data }) {
  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);
  if (!env.SESSION_SECRET) return json({ error: 'Voice is not configured' }, 503);

  const rawName = new URL(request.url).searchParams.get('name') || steamId;
  const name = rawName.slice(0, 32);

  try {
    const ticket = await signTicket(env, steamId, name);
    return json({ ticket });
  } catch (error) {
    return json({ error: error.message || 'Voice ticket failed' }, 502);
  }
}
