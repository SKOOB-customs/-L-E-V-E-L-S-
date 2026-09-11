/**
 * Friends: accept a pending teleport request. Writes the actual
 * teleport-execute request on the Worker side (whichever of the two
 * friends is the "mover" per the original request's direction) — main.lua
 * picks it up on its next poll tick and notifies both friends in-game
 * once it happens. No result polling here (see bridge-worker.js's
 * requestTeleportExecute comment for why).
 *
 * POST { requesterSteamId } -> proxied to the bridge Worker's
 * /teleport-accept route (steamId is always the caller's own steamId).
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

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { steamId, requesterSteamId } = body || {};
  if (!isValidSteamId(steamId)) return json({ error: 'Missing or invalid steamId' }, 400);
  if (!isValidSteamId(requesterSteamId)) return json({ error: 'Missing or invalid requesterSteamId' }, 400);

  try {
    const response = await fetch(`${origin}/teleport-accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ steamId, requesterSteamId }),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Teleport accept failed' }, 502);
  }
}
