/**
 * Sends one global chat message. steamId/name come from the caller's own
 * logged-in Steam session on the client (same trust model as everywhere
 * else on this site, e.g. submit-ticket.js's username field) — the point
 * raised was that players shouldn't have to type a display name by hand
 * since they're already logged in, not that the server needs to
 * re-verify it via a session store this codebase doesn't have.
 *
 * Read-modify-write on a single global_chat:index KV key, capped at the
 * most recent 200 messages so it can't grow unbounded — direct KV, no
 * Pterodactyl/game-server involvement.
 *
 * POST { steamId, name, text } -> {ok:true}
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const MAX_MESSAGE_LENGTH = 240;
const MAX_STORED_MESSAGES = 200;

export async function onRequestPost({ request, env }) {
  if (!env.PARKED_KV) return json({ error: 'Chat storage is not configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const steamId = typeof body.steamId === 'string' ? body.steamId : '';
  if (!/^\d{17}$/.test(steamId)) return json({ error: 'Missing or invalid steamId' }, 400);

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 32) : steamId;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return json({ error: 'Message is empty' }, 400);
  if (text.length > MAX_MESSAGE_LENGTH) {
    return json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }, 400);
  }

  try {
    const raw = await env.PARKED_KV.get('global_chat:index');
    let messages = [];
    if (raw) {
      try {
        messages = JSON.parse(raw);
        if (!Array.isArray(messages)) messages = [];
      } catch {
        messages = [];
      }
    }
    messages.push({ id: crypto.randomUUID(), steamId, name, text, at: Date.now() });
    if (messages.length > MAX_STORED_MESSAGES) messages = messages.slice(-MAX_STORED_MESSAGES);
    await env.PARKED_KV.put('global_chat:index', JSON.stringify(messages));
  } catch (error) {
    return json({ error: error.message || 'Message send failed' }, 502);
  }

  return json({ ok: true });
}
