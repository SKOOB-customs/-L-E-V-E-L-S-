/**
 * Website-triggered redeem (mod <-> website bridge, write direction).
 *
 * POST { steamId, snapshotId } -> asks the bridge Worker to write a redeem
 *   request file the mod's poll loop will pick up (see main.lua's
 *   GameState.PlayerArray-based poller). Returns { requestId } for polling.
 * GET  ?steamId=&requestId= -> polls for the mod's result. { ok: null } means
 *   not processed yet; { ok: true/false, message } is the real outcome.
 *
 * Both proxy to the Worker's /redeem-request and /redeem-result routes —
 * same cross-service indirection functions/api/live-dino.js already uses
 * (self-fetches to the apex domain get intercepted by the SPA instead of
 * the Worker, so this always targets the Worker's own origin instead).
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

  const { steamId, snapshotId } = body || {};
  if (!isValidSteamId(steamId)) return json({ error: 'Missing or invalid steamId' }, 400);
  if (typeof snapshotId !== 'number') return json({ error: 'Missing or invalid snapshotId' }, 400);

  try {
    const response = await fetch(`${origin}/redeem-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ steamId, snapshotId }),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Redeem request failed' }, 502);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const url = new URL(request.url);
  const steamId = url.searchParams.get('steamId');
  const requestId = url.searchParams.get('requestId');
  if (!isValidSteamId(steamId) || !requestId) {
    return json({ error: 'Missing or invalid steamId/requestId' }, 400);
  }

  try {
    const target = new URL(`${origin}/redeem-result`);
    target.searchParams.set('steamId', steamId);
    target.searchParams.set('requestId', requestId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Redeem result lookup failed' }, 502);
  }
}
