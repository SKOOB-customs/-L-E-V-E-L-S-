/**
 * Chat moderation: mute a player from sending chat for 1-24 hours (they
 * can still read chat). Admin/owner only — re-validated by tier on the
 * Worker.
 *
 * POST { targetSteamId, hours } -> proxied to the bridge Worker's
 * /chat-timeout route. moderatorSteamId comes from the verified session,
 * not a client-supplied field.
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

  const moderatorSteamId = data.authedSteamId;
  if (!moderatorSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const { targetSteamId, hours } = body || {};
  if (!isValidSteamId(targetSteamId)) return json({ error: 'Missing or invalid targetSteamId' }, 400);

  try {
    const response = await fetch(`${origin}/chat-timeout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ moderatorSteamId, targetSteamId, hours }),
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Timeout failed' }, 502);
  }
}
