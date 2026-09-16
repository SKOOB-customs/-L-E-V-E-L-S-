/**
 * Self-service "Meet the Staff" bio editor — every admin/senior/owner
 * sets their own paragraph for the Community tab's public roster, no
 * owner approval needed (same self-service spirit as the Admin Panel
 * passkey). POST { bio } -> forwarded as { steamId: authedSteamId, bio }
 * to the bridge Worker's /staff-bio-set, which re-verifies the caller is
 * actually staff (a real tier lookup) before writing — steamId here is
 * always the verified session's own id, never anything client-supplied,
 * so nobody can write another admin's bio through this route.
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

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam first.' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const bio = typeof body?.bio === 'string' ? body.bio : '';

  try {
    const response = await fetch(`${origin}/staff-bio-set`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ steamId, bio }),
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Could not save bio' }, 502);
  }
}
