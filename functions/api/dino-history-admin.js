/**
 * Admin Panel's Recover Dinos: looks up ANY player's dino history (not
 * just the caller's own, unlike dino-history.js which was deliberately
 * hardened to never allow that).
 *
 * GET ?targetSteamId= -> proxied to the bridge Worker's
 * /dino-history-admin route, which re-verifies the caller's real admin
 * tier server-side before returning anything. Same cross-service
 * indirection every other functions/api/*.js file uses (see park.js).
 * requesterSteamId comes from the verified session, never a
 * client-supplied field.
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
  const { request, env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const requesterSteamId = data.authedSteamId;
  if (!requesterSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);
  if (!data.adminUnlocked) return json({ error: 'Enter your admin passkey to use the Admin Panel.' }, 403);

  const url = new URL(request.url);
  const targetSteamId = url.searchParams.get('targetSteamId');
  if (!targetSteamId || !/^\d{17}$/.test(targetSteamId)) {
    return json({ error: 'Missing or invalid targetSteamId' }, 400);
  }

  try {
    const target = new URL(`${origin}/dino-history-admin`);
    target.searchParams.set('requesterSteamId', requesterSteamId);
    target.searchParams.set('targetSteamId', targetSteamId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Dino history lookup failed' }, 502);
  }
}
