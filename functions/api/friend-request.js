/**
 * Friends: send a friend request.
 *
 * POST { toSteamId } -> proxied to the bridge Worker's /friend-request
 * route (fromSteamId is always the caller's own signed-in steamId).
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

  const { fromSteamId, toSteamId } = body || {};
  if (!isValidSteamId(fromSteamId)) return json({ error: 'Missing or invalid fromSteamId' }, 400);
  if (!isValidSteamId(toSteamId)) return json({ error: 'Missing or invalid toSteamId' }, 400);

  try {
    const response = await fetch(`${origin}/friend-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ fromSteamId, toSteamId }),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Friend request failed' }, 502);
  }
}
