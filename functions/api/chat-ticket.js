/**
 * Mints a short-lived (60s) signed ticket for opening a chat WebSocket —
 * global chat, or one faction's own chat (?room=faction-<id>). Chat
 * connects directly to the bridge Worker's own workers.dev origin (not
 * this site's own domain — see wrangler.jsonc), so the levels_session
 * cookie never reaches it; this same-origin endpoint sees the cookie,
 * verifies it, and hands back a ticket the Worker can verify on its own
 * using the same shared SESSION_SECRET, without ever trusting a
 * client-supplied steamId directly.
 *
 * GET ?name=&room= -> { ticket }. name is just the display name to show
 * next to messages — not a trust boundary (the ticket's steamId, the
 * thing chat actions actually key off of, comes from the verified
 * session either way). room defaults to "global"; a faction room is only
 * granted after confirming via the Worker's /chat-room-access that this
 * steamId is actually a member of that faction (or any admin tier, who
 * can open any room) — the room is then embedded in the signed ticket
 * itself, so holding a ticket IS the proof of authorization from that
 * point on.
 */

import { signTicket } from '../_lib/session.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const workerOrigin = (env) => {
  if (!env.SERVER_STATUS_URL) return null;
  try {
    return new URL(env.SERVER_STATUS_URL).origin;
  } catch {
    return null;
  }
};

export async function onRequestGet({ request, env, data }) {
  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);
  if (!env.SESSION_SECRET) return json({ error: 'Chat is not configured' }, 503);

  const requestUrl = new URL(request.url);
  const rawName = requestUrl.searchParams.get('name') || steamId;
  const name = rawName.slice(0, 32);
  const room = requestUrl.searchParams.get('room') || 'global';

  if (room !== 'global') {
    const origin = workerOrigin(env);
    if (!origin) return json({ error: 'Bridge is not configured' }, 503);
    try {
      const target = new URL(`${origin}/chat-room-access`);
      target.searchParams.set('steamId', steamId);
      target.searchParams.set('room', room);
      const response = await fetch(target.toString(), {
        headers: {
          Accept: 'application/json',
          ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
        },
      });
      const accessData = await response.json();
      if (!response.ok || !accessData.authorized) {
        return json({ error: 'Not authorized for that chat room' }, 403);
      }
    } catch (error) {
      return json({ error: error.message || 'Chat room access check failed' }, 502);
    }
  }

  try {
    const ticket = await signTicket(env, steamId, name, room);
    return json({ ticket });
  } catch (error) {
    return json({ error: error.message || 'Chat ticket failed' }, 502);
  }
}
