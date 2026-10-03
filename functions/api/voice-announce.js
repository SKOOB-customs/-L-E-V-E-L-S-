/**
 * Proximity Voice (Phase 0) presence: announces (or refreshes) the
 * caller's own entry in the shared voice_presence:index KV key, so other
 * voice-enabled browsers can discover their Calls sessionId/trackName to
 * pull from. Called once on enabling voice, then as a repeating
 * heartbeat (~every 8s) the whole time voice stays on — same direct-KV,
 * overwritten-not-appended shape as heartbeat.js's presence:index, just
 * scoped to voice participants specifically with the extra session
 * fields voice needs.
 *
 * POST { name, sessionId, trackName } -> { ok: true }
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestPost(context) {
  const { request, env, data } = context;
  if (!env.PARKED_KV) return json({ error: 'Presence storage is not configured' }, 503);

  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { name, sessionId, trackName } = body || {};
  if (typeof sessionId !== 'string' || !sessionId) return json({ error: 'Missing sessionId' }, 400);
  if (typeof trackName !== 'string' || !trackName) return json({ error: 'Missing trackName' }, 400);
  const trimmedName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 32) : steamId;

  try {
    const raw = await env.PARKED_KV.get('voice_presence:index');
    let presence = {};
    if (raw) {
      try { presence = JSON.parse(raw) || {}; } catch { presence = {}; }
    }
    presence[steamId] = { name: trimmedName, sessionId, trackName, updatedAt: Date.now() };
    await env.PARKED_KV.put('voice_presence:index', JSON.stringify(presence));
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'Voice announce failed' }, 502);
  }
}
