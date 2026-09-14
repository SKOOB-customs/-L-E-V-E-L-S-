/**
 * Admin-tier lookup for the website's Admin Panel tab.
 *
 * GET -> { tier: "owner"|"senior"|"admin"|null } for the caller's verified
 * session steamId, proxied to the bridge Worker's /admin-tier route (same
 * cross-service indirection every other functions/api/*.js file uses —
 * see park.js for the full rationale). Purely a UI-reveal check; the
 * actual write routes (compensation, strikes) re-validate tier
 * server-side on the Worker regardless of what this says — but this now
 * checks the REAL caller too, not a client-supplied steam_id, since
 * nothing stopped someone from asking "what's this OTHER steamId's admin
 * tier" before.
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
  const { env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const steamId = data.authedSteamId;
  if (!isValidSteamId(steamId)) return json({ tier: null });

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
