/**
 * Owner-tier-only: restore a deleted skin from the recycle bin back into
 * the live Skin Library. Tier is re-validated server-side on the Worker
 * regardless of what the admin panel UI shows.
 *
 * POST { id } -> proxied to the bridge Worker's /skin-library-restore
 * route. granterSteamId comes from the verified session, not a
 * client-supplied field.
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

  const granterSteamId = data.authedSteamId;
  if (!granterSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);
  if (!data.adminUnlocked) return json({ error: 'Enter your admin passkey to use the Admin Panel.' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    const response = await fetch(`${origin}/skin-library-restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ ...body, granterSteamId }),
    });
    const data2 = await response.json();
    return json(data2, response.status);
  } catch (error) {
    return json({ error: error.message || 'Skin library restore failed' }, 502);
  }
}
