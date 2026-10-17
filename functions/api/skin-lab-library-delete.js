/**
 * Skin Lab tab's "Delete" on a library skin — same shared
 * skin_library:index catalog (and skin_library_trash:index recycle bin)
 * as the Owner tab's Skin Library, gated by hasSkinLabAccess instead of
 * strict owner tier, and not gated on data.adminUnlocked at all.
 *
 * POST { name } -> proxied to the bridge Worker's
 * /skin-lab-library-delete route using the caller's verified session
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
  const { name } = body || {};

  try {
    const response = await fetch(`${origin}/skin-lab-library-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ requesterSteamId, name }),
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Skin library delete failed' }, 502);
  }
}
