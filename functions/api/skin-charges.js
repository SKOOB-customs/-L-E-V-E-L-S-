/**
 * Inventory: the caller's own skin-charge ledger — the named skins they
 * have any charges of, for the "Skins" subsection of the Inventory tab.
 *
 * GET -> proxied to the bridge Worker's /skin-charges route using the
 * caller's verified session steamId.
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
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  try {
    const target = new URL(`${origin}/skin-charges`);
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
    return json({ error: error.message || 'Skin charges lookup failed' }, 502);
  }
}
