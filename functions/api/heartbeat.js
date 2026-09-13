/**
 * Website presence heartbeat: called every ~3 minutes by any signed-in
 * player's browser tab while it's open and visible (see script.js's
 * sendHeartbeat). Written to a single shared presence:index KV key,
 * keyed by steamId — overwritten per player, not appended, so this never
 * grows with heartbeat frequency (unlike an append-only log), only with
 * the number of distinct players ever seen. Used by the Friends tab to
 * show "online on website" independent of in-game status.
 *
 * POST { steamId } -> {ok:true}
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestPost({ request, env }) {
  if (!env.PARKED_KV) return json({ error: 'Presence storage is not configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const steamId = typeof body.steamId === 'string' ? body.steamId : '';
  if (!/^\d{17}$/.test(steamId)) return json({ error: 'Missing or invalid steamId' }, 400);

  try {
    const raw = await env.PARKED_KV.get('presence:index');
    let presence = {};
    if (raw) {
      try {
        presence = JSON.parse(raw) || {};
      } catch {
        presence = {};
      }
    }
    presence[steamId] = Date.now();
    await env.PARKED_KV.put('presence:index', JSON.stringify(presence));
  } catch (error) {
    return json({ error: error.message || 'Heartbeat failed' }, 502);
  }

  return json({ ok: true });
}
