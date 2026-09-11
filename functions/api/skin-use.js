/**
 * Inventory: spend one skin charge on the caller's CURRENT live dino —
 * one-shot, does not persist past that pawn's life (no auto-restore
 * exists for this path). Same request/poll shape as park.js/redeem.js.
 *
 * POST { steamId, skinCode } -> asks the bridge Worker to write a
 *   skin_use_request_<steamid>.json file the mod's poll loop will pick
 *   up. Returns { requestId } for polling.
 * GET  ?steamId=&requestId= -> polls for the mod's real result.
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

  const { steamId, skinCode } = body || {};
  if (!isValidSteamId(steamId)) return json({ error: 'Missing or invalid steamId' }, 400);
  if (typeof skinCode !== 'string' || skinCode === '') return json({ error: 'Missing or invalid skinCode' }, 400);

  try {
    const response = await fetch(`${origin}/skin-use-live`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ steamId, requesterSteamId: steamId, skinCode }),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Skin use request failed' }, 502);
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
    const target = new URL(`${origin}/skin-use-result`);
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
    return json({ error: error.message || 'Skin use result lookup failed' }, 502);
  }
}
