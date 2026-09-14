/**
 * Friends: gift one parked dino to a friend.
 *
 * POST { toSteamId, capturedAt } -> proxied to the bridge Worker's
 * /gift-dino route. fromSteamId comes from the verified session, not a
 * client-supplied field — capturedAt identifies which of the caller's
 * parked dinos to transfer. The Worker enforces that the two are actually
 * friends before moving anything.
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

  const fromSteamId = data.authedSteamId;
  if (!isValidSteamId(fromSteamId)) return json({ error: 'Please sign in with Steam again.' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { toSteamId, capturedAt } = body || {};
  if (!isValidSteamId(toSteamId)) return json({ error: 'Missing or invalid toSteamId' }, 400);
  if (typeof capturedAt !== 'number') return json({ error: 'Missing or invalid capturedAt' }, 400);

  try {
    const response = await fetch(`${origin}/gift-dino`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ fromSteamId, toSteamId, capturedAt }),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Gift failed' }, 502);
  }
}
