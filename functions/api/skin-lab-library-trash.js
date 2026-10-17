/**
 * Skin Lab tab's own read of the shared skin_library_trash:index recycle
 * bin — same data the Owner tab's "Deleted Skins" section shows, gated
 * by hasSkinLabAccess instead of strict owner tier, and not gated on
 * data.adminUnlocked at all.
 *
 * GET -> proxied to the bridge Worker's /skin-lab-library-trash route
 * using the caller's verified session steamId.
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

export async function onRequestGet(context) {
  const { env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const requesterSteamId = data.authedSteamId;
  if (!requesterSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  try {
    const target = new URL(`${origin}/skin-lab-library-trash`);
    target.searchParams.set('requesterSteamId', requesterSteamId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Skin library trash lookup failed' }, 502);
  }
}
