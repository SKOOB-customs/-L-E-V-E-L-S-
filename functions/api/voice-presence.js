/**
 * Proximity Voice (Phase 0) presence: who else currently has voice open,
 * for the browser to pull tracks from. Entries older than
 * PRESENCE_STALE_MS are filtered out here rather than ever being
 * explicitly deleted on a dropped connection (no clean "disconnect"
 * signal exists for a closed tab) — same reasoning as the chat timeout/
 * ban TTL checks elsewhere in this project. The caller's own entry is
 * excluded; nobody needs to pull their own track back.
 *
 * GET -> { ok, participants: [{ steamId, name, sessionId, trackName }] }
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const PRESENCE_STALE_MS = 20000;

export async function onRequestGet(context) {
  const { env, data } = context;
  if (!env.PARKED_KV) return json({ ok: true, participants: [] });

  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  try {
    const raw = await env.PARKED_KV.get('voice_presence:index');
    let presence = {};
    if (raw) {
      try { presence = JSON.parse(raw) || {}; } catch { presence = {}; }
    }
    const now = Date.now();
    const participants = Object.entries(presence)
      .filter(([id, entry]) => id !== steamId && entry?.updatedAt && now - entry.updatedAt < PRESENCE_STALE_MS)
      .map(([id, entry]) => ({ steamId: id, name: entry.name, sessionId: entry.sessionId, trackName: entry.trackName }));
    return json({ ok: true, participants });
  } catch (error) {
    return json({ error: error.message || 'Voice presence lookup failed' }, 502);
  }
}
