/**
 * Website-triggered park (mod <-> website bridge, write direction).
 *
 * POST { name? } -> asks the bridge Worker to write a park request file
 *   the mod's poll loop will pick up (see main.lua's
 *   gm.AllPlayerControllers-based poller). Returns { requestId } for polling.
 * GET  ?requestId= -> polls for the mod's real result, same as
 *   functions/api/redeem.js's GET. Both derive steamId from the verified
 *   session, not a client-supplied field.
 *
 * Both proxy to the Worker's /park-request and /park-result routes — same
 * cross-service indirection functions/api/live-dino.js already uses
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
  const { request, env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const steamId = data.authedSteamId;
  if (!isValidSteamId(steamId)) return json({ error: 'Please sign in with Steam again.' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { name } = body || {};
  if (name !== undefined && typeof name !== 'string') return json({ error: 'Invalid name' }, 400);

  try {
    const response = await fetch(`${origin}/park-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ steamId, name }),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Park request failed' }, 502);
  }
}

export async function onRequestGet(context) {
  const { request, env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const steamId = data.authedSteamId;
  if (!isValidSteamId(steamId)) return json({ error: 'Please sign in with Steam again.' }, 401);

  const url = new URL(request.url);
  const requestId = url.searchParams.get('requestId');
  if (!requestId) {
    return json({ error: 'Missing or invalid requestId' }, 400);
  }

  try {
    const target = new URL(`${origin}/park-result`);
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
    return json({ error: error.message || 'Park result lookup failed' }, 502);
  }
}
