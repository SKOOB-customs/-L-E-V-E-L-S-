/**
 * Home tab: Event Teleport button. Same request/poll shape as
 * sanctuary-teleport.js — teleports the caller to their own faction's
 * event drop point. Gated server-side by faction membership and the live
 * event's active window.
 *
 * POST {} -> asks the bridge Worker to write an
 *   event_teleport_request_<steamid>.json file the mod's poll loop picks
 *   up. Returns { requestId }.
 * GET  ?requestId= -> polls for the mod's real result.
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

export async function onRequestPost({ env, data }) {
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const steamId = data.authedSteamId;
  if (!isValidSteamId(steamId)) return json({ error: 'Please sign in with Steam again.' }, 401);

  try {
    const response = await fetch(`${origin}/event-teleport-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ steamId }),
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Event teleport request failed' }, 502);
  }
}

export async function onRequestGet({ request, env, data }) {
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const steamId = data.authedSteamId;
  if (!isValidSteamId(steamId)) return json({ error: 'Please sign in with Steam again.' }, 401);

  const requestId = new URL(request.url).searchParams.get('requestId');
  if (!requestId) return json({ error: 'Missing or invalid requestId' }, 400);

  try {
    const target = new URL(`${origin}/event-teleport-result`);
    target.searchParams.set('steamId', steamId);
    target.searchParams.set('requestId', requestId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Event teleport result lookup failed' }, 502);
  }
}
