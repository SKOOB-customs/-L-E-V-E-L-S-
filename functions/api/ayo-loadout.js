/**
 * Live Dino tab: Ayo(R)/Ayo(T) loadout buttons — replaces the old single
 * Dome button for Ayo-prefixed/PermException accounts. Teleports to the
 * Dome coordinates AND transforms the caller's current live dino into a
 * fixed loadout (growth/Prime/mutations), gated the same way redeem is:
 * live species has to already match. Same request/poll shape as
 * dome-teleport.js.
 *
 * POST { loadoutId: 'rex'|'trike' } -> asks the bridge Worker to write an
 *   ayo_loadout_request_<steamid>.json file the mod's poll loop will
 *   pick up. Returns { requestId }.
 * GET  ?requestId= -> polls for the mod's real result. Both derive
 *   steamId from the verified session, never a client-supplied field.
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

export async function onRequestPost({ request, env, data }) {
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
  const { loadoutId } = body || {};

  try {
    const response = await fetch(`${origin}/ayo-loadout-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ steamId, loadoutId }),
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Ayo loadout request failed' }, 502);
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
    const target = new URL(`${origin}/ayo-loadout-result`);
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
    return json({ error: error.message || 'Ayo loadout result lookup failed' }, 502);
  }
}
