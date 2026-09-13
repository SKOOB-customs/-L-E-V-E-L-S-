/**
 * Reads the owner-tier Skin Library catalog — used both by the owner-only
 * management area and by the regular Glitch Skins grant form's "Load from
 * library" dropdown (any admin tier can read; only owner tier can save/
 * delete, enforced server-side by the Worker regardless of what this UI
 * shows).
 *
 * GET ?requesterSteamId= -> proxied to the bridge Worker's /skin-library route.
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
  const { request, env } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const url = new URL(request.url);
  const requesterSteamId = url.searchParams.get('requesterSteamId');
  if (!requesterSteamId || !/^\d{17}$/.test(requesterSteamId)) {
    return json({ error: 'Missing or invalid requesterSteamId' }, 400);
  }

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
