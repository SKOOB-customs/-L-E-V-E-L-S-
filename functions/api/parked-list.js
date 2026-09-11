/**
 * A single player's parked dinos, synced from the game server by
 * workers/bridge-worker.js's `scheduled` handler (a Cron Trigger polling
 * Bropanel's Pterodactyl Client API for Mods/LevelsPark/Saved/
 * parked_<steamid>.json files). KV holds every player's data aggregated
 * together, but this endpoint requires steam_id and only ever returns that
 * one player's entries — players should only see and be able to redeem
 * their own parked dinos, never anyone else's (matching the trust model
 * the rest of this site already uses: steam_id is client-supplied, same as
 * /api/live-dino and the old inventory API — not a new gap introduced here).
 *
 * The cron only runs once a minute (Cloudflare's floor), which is a
 * noticeable "why isn't my dino showing up yet" gap right after
 * !park/!redeem — so every request here first asks the Worker to sync right
 * now (same cross-service call functions/api/redeem.js uses) and only falls
 * back to whatever's already cached in KV if that live sync fails or times
 * out, rather than making the page wait indefinitely.
 *
 * GET ?steam_id=X -> { updatedAt: number | null, parked: { [snapshotKey]: {...} } }
 */

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

const isValidSteamId = (id) => typeof id === 'string' && /^\d{17}$/.test(id);

const SYNC_TIMEOUT_MS = 8000;

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.PARKED_KV) return json({ error: 'Parked storage is not configured' }, 503);

  const steamId = new URL(request.url).searchParams.get('steam_id');
  if (!isValidSteamId(steamId)) return json({ error: 'Missing or invalid steam_id' }, 400);

  const origin = workerOrigin(env);
  if (origin) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
    try {
      await fetch(`${origin}/sync-parked`, {
        signal: controller.signal,
        headers: env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {},
      });
    } catch (error) {
      // A failed or slow live sync shouldn't break the page — just fall
      // through and serve whatever the last cron run (or a previous
      // request's sync) already put in KV.
      console.debug('Live parked-dino sync failed, serving cached KV:', error);
    } finally {
      clearTimeout(timeout);
    }
  }

  const index = await env.PARKED_KV.get('parked:index', 'json');
  const allParked = index?.parked || {};
  const parked = Object.fromEntries(
    Object.entries(allParked).filter(([, entry]) => entry.steam === steamId),
  );
  return json({ updatedAt: index?.updatedAt || null, parked });
}
