/**
 * Live Dino tab: force Prime status on the caller's own live dino,
 * bypassing the game's normal prime-condition requirements. Self-service
 * (no admin tier) — gated below 75% growth server-side by main.lua's
 * trySetPrime. Same request/poll shape as growth-pause.js.
 *
 * POST { steamId } -> asks the bridge Worker to write a
 *   set_prime_request_<steamid>.json file the mod's poll loop will pick
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

  const { steamId } = body || {};
  if (!isValidSteamId(steamId)) return json({ error: 'Missing or invalid steamId' }, 400);

  try {
    const response = await fetch(`${origin}/set-prime-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ steamId }),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Set-prime request failed' }, 502);
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
    const target = new URL(`${origin}/set-prime-result`);
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
    return json({ error: error.message || 'Set-prime result lookup failed' }, 502);
  }
}
