/**
 * Admin Panel's Currency sub-tab: Currency Log — admin-granted currency
 * only, never the natural playtime/war-payout accrual (see
 * bridge-worker.js's /currency-log route for why).
 *
 * GET (no params) -> { entries: [{at, action, actorSteamId,
 * targetSteamId, detail}] }, proxied to the bridge Worker's
 * /currency-log route, which re-verifies the caller is an admin (any
 * tier — matches who can grant currency at all, unlike Moderation Log's
 * owner-only gate) before returning anything. requesterSteamId comes
 * from the verified session, never a client-supplied field.
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
  if (!data.adminUnlocked) return json({ error: 'Enter your admin passkey to use the Admin Panel.' }, 403);

  try {
    const target = new URL(`${origin}/currency-log`);
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
    return json({ error: error.message || 'Currency log lookup failed' }, 502);
  }
}
