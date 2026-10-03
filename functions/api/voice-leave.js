/**
 * Proximity Voice (Phase 0) presence: removes the caller's own entry
 * from voice_presence:index on an explicit "disable voice" click, so
 * other participants stop seeing them in-range immediately rather than
 * waiting out PRESENCE_STALE_MS in voice-presence.js.
 *
 * POST (no body) -> { ok: true }
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestPost(context) {
  const { env, data } = context;
  if (!env.PARKED_KV) return json({ ok: true });

  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  try {
    const raw = await env.PARKED_KV.get('voice_presence:index');
    let presence = {};
    if (raw) {
      try { presence = JSON.parse(raw) || {}; } catch { presence = {}; }
    }
    delete presence[steamId];
    await env.PARKED_KV.put('voice_presence:index', JSON.stringify(presence));
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'Voice leave failed' }, 502);
  }
}
