/**
 * Reads the owner-tier Skin Library catalog — used both by the owner-only
 * management area and by the regular Glitch Skins grant form's "Load from
 * library" dropdown (any admin tier can read; only owner tier can save/
 * delete, enforced server-side by the Worker regardless of what this UI
 * shows).
 *
 * GET -> proxied to the bridge Worker's /skin-library route using the
 * caller's verified session steamId.
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
    const target = new URL(`${origin}/skin-library`);
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
    return json({ error: error.message || 'Skin library lookup failed' }, 502);
  }
}
