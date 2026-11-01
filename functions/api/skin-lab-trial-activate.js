/**
 * Skin Lab tab: activate the one-time, lifetime 28-day free trial for a
 * regular (non-owner, non-whitelisted) player. Open to any signed-in
 * player — no admin tier, no admin passkey.
 *
 * POST (no body needed) -> proxied to the bridge Worker's
 * /skin-lab-trial-activate route using the caller's verified session
 * steamId. The Worker is idempotent — a repeat call never resets or
 * extends the clock.
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
  const { env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  try {
    const response = await fetch(`${origin}/skin-lab-trial-activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ steamId }),
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Could not activate the free period' }, 502);
  }
}
