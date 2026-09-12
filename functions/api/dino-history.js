/**
 * A player's own dino history: every dino they've spawned as, synced from
 * the game server by workers/bridge-worker.js's `syncDinoHistory` cron step
 * (reads Mods/LevelsPark/Saved/dino_history_<steamid>.json files, aggregates
 * into the 'dino_history:index' KV key). Read directly from KV here — same
 * direct-PARKED_KV-access precedent as parked-list.js/player-directory.js —
 * rather than round-tripping through the Worker.
 *
 * Only ever returns the requester's own steamId's entries, matching the
 * trust model the rest of this site already uses (steamId is client-
 * supplied, e.g. currency-balance's ?steamId=). Up to a minute of lag after
 * an in-game event is expected and accepted, same as the currency balance.
 *
 * GET ?steamId=X -> { updatedAt: number | null, entries: [...] }
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.PARKED_KV) return json({ error: 'Dino history storage is not configured' }, 503);

  const steamId = new URL(request.url).searchParams.get('steamId');
  if (!steamId || !/^\d{17}$/.test(steamId)) {
    return json({ error: 'Missing or invalid steamId' }, 400);
  }

  const index = await env.PARKED_KV.get('dino_history:index', 'json');
  const entries = index?.histories?.[steamId] || [];
  return json({ updatedAt: index?.updatedAt || null, entries });
}
