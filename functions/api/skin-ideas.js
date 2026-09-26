/**
 * Owner-only sidebar list of every submitted skin idea (newest activity
 * first). Same owner-tier + admin-passkey gate as moderation-log.js.
 *
 * GET -> proxied to the bridge Worker's /skin-ideas route, which
 * re-verifies the caller is actually an OWNER before returning anything.
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
  const { env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const requesterSteamId = data.authedSteamId;
  if (!requesterSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);
  if (!data.adminUnlocked) return json({ error: 'Enter your admin passkey to use the Admin Panel.' }, 403);

  try {
    const target = new URL(`${origin}/skin-ideas`);
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
    return json({ error: error.message || 'Skin idea list lookup failed' }, 502);
  }
}
