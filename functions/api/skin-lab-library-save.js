/**
 * Skin Lab tab's "Save to library" — same shared skin_library:index
 * catalog as the Owner tab's Skin Library, gated by hasSkinLabAccess
 * (owner tier OR the one whitelisted non-admin Steam ID) instead of
 * strict owner tier, and not gated on data.adminUnlocked at all.
 *
 * POST { name, colors } -> proxied to the bridge Worker's
 * /skin-lab-library-save route using the caller's verified session
 * steamId.
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

  const requesterSteamId = data.authedSteamId;
  if (!requesterSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const { name, colors } = body || {};

  try {
    const response = await fetch(`${origin}/skin-lab-library-save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ requesterSteamId, name, colors }),
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Skin library save failed' }, 502);
  }
}
