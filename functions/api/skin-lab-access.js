/**
 * Skin Lab tab visibility check — owner tier, plus one specific
 * non-admin Steam ID (see bridge-worker.js's hasSkinLabAccess for the
 * actual allowlist). Deliberately NOT gated on data.adminUnlocked — the
 * whole point of this tab is to work for an account that has no admin
 * passkey and never will.
 *
 * GET -> { access: boolean } for the caller's verified session steamId.
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

  const steamId = data.authedSteamId;
  if (!steamId) return json({ access: false });

  try {
    const target = new URL(`${origin}/skin-lab-access`);
    target.searchParams.set('steamId', steamId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Skin Lab access check failed' }, 502);
  }
}
