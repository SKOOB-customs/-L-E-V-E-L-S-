/**
 * Admin-panel strikes (website -> Worker -> Cloudflare KV only, never the
 * game server — these records don't need to exist anywhere an admin's
 * file-system access could reach, unlike the game-server-side audit log).
 *
 * POST { issuerSteamId, targetSteamId, reason, evidence? } -> issues a new
 *   strike, proxied to the Worker's /strikes-issue route.
 * GET  ?targetSteamId=&requesterSteamId= -> that player's strike history
 *   (newest first), proxied to the Worker's /strikes-list route. Both ends
 *   re-validate the caller's admin tier server-side on the Worker.
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

  try {
    const response = await fetch(`${origin}/strikes-issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Strike issue failed' }, 502);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const url = new URL(request.url);
  const targetSteamId = url.searchParams.get('targetSteamId');
  const requesterSteamId = url.searchParams.get('requesterSteamId');
  if (!isValidSteamId(targetSteamId) || !isValidSteamId(requesterSteamId)) {
    return json({ error: 'Missing or invalid targetSteamId/requesterSteamId' }, 400);
  }

  try {
    const target = new URL(`${origin}/strikes-list`);
    target.searchParams.set('targetSteamId', targetSteamId);
    target.searchParams.set('requesterSteamId', requesterSteamId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Strike list failed' }, 502);
  }
}
