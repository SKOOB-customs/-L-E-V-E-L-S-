/**
 * Live Dino tab: pause/resume growth on the caller's own live dino.
 * Same request/poll shape as skin-use.js.
 *
 * POST { action: "pause"|"resume" } -> asks the bridge Worker to write a
 *   growth_pause_request_<steamid>.json file the mod's poll loop will
 *   pick up. Returns { requestId } for polling.
 * GET  ?requestId= -> polls for the mod's real result. Both derive
 *   steamId from the verified session, not a client-supplied field.
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

  const { action } = body || {};
  if (action !== 'pause' && action !== 'resume') {
    return json({ error: 'action must be "pause" or "resume"' }, 400);
  }

  try {
    const response = await fetch(`${origin}/growth-pause-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ steamId, action }),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Growth pause request failed' }, 502);
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
    const target = new URL(`${origin}/growth-pause-result`);
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
    return json({ error: error.message || 'Growth pause result lookup failed' }, 502);
  }
}
