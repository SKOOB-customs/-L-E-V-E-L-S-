/**
 * Read-only view of the aggregated parked-dino data synced from the game
 * server by workers/bridge-worker.js's `scheduled` handler (a Cron Trigger
 * polling Bropanel's Pterodactyl Client API for Mods/LevelsPark/Saved/
 * parked_<steamid>.json files). This is the first end-to-end check that the
 * mod <-> website bridge works — the actual inventory gallery UI is a
 * separate, later pass.
 *
 * GET -> { updatedAt: number | null, parked: { [steamId]: {...} } }
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.PARKED_KV) return json({ error: 'Parked storage is not configured' }, 503);

  const index = await env.PARKED_KV.get('parked:index', 'json');
  return json({ updatedAt: index?.updatedAt || null, parked: index?.parked || {} });
}
