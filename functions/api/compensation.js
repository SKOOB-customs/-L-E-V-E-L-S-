/**
 * Admin-panel compensation grant (website -> Worker -> game-server file).
 *
 * POST { targetSteamId, species, name?, growthPct?, healthPct?,
 *        staminaPct?, hungerPct?, thirstPct?, entombments?, mutations? }
 * -> proxies to the bridge Worker's /compensation-grant route, which
 * appends a redeemable dino snapshot to the target's
 * parked_<steamid>.json — the exact file format main.lua's !park already
 * produces, so !redeem / the website's Redeem button need no changes to
 * pick it up. Same cross-service indirection every other
 * functions/api/*.js file uses (see park.js). granterSteamId comes from
 * the verified session, not a client-supplied field — this is an
 * admin-only action, re-validated by tier on the Worker.
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
    const response = await fetch(`${origin}/compensation-grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ ...body, granterSteamId }),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Compensation grant failed' }, 502);
  }
}
