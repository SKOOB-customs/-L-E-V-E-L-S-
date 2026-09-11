/**
 * Admin-panel glitch skin grant (website -> Worker -> skin_<steamid>.json).
 *
 * POST { granterSteamId, targetSteamId, colors } -> proxied to the bridge
 * Worker's /skin-grant route, which re-validates admin tier server-side.
 * `colors` is a map of the 10 FCustomizerDataBase color field names to
 * either a "#RRGGBB" hex string (the picker UI) or a {r,g,b,a} object (the
 * Advanced JSON path) — the Worker normalizes either shape the same way.
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
  const { request, env } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    const response = await fetch(`${origin}/skin-grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Skin grant failed' }, 502);
  }
}
