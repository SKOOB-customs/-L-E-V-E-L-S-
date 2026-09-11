/**
 * Admin-tier lookup for the website's Admin Panel tab.
 *
 * GET ?steam_id= -> { tier: "owner"|"senior"|"admin"|null }, proxied to the
 * bridge Worker's /admin-tier route (same cross-service indirection every
 * other functions/api/*.js file uses — see park.js for the full rationale).
 * Purely a UI-reveal check; the actual write routes (compensation, strikes)
 * re-validate tier server-side on the Worker regardless of what this says.
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

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const url = new URL(request.url);
  const steamId = url.searchParams.get('steam_id');
  if (!isValidSteamId(steamId)) return json({ error: 'Missing or invalid steam_id' }, 400);

  try {
    const target = new URL(`${origin}/admin-tier`);
    target.searchParams.set('steamId', steamId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Admin tier lookup failed' }, 502);
  }
}
