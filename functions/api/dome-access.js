/**
 * Dome Teleport button visibility check — "Ayo"-prefixed Steam display
 * name, or anyone in the Worker's PermExceptions allowlist (see
 * hasDomeAccess/PERM_EXCEPTIONS in bridge-worker.js). Replaces the old
 * client-side `profile.username.startsWith('Ayo')` guess, which read
 * the OAuth-cached name instead of player_directory's authoritative one
 * and had no way to know about PermExceptions.
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
    const target = new URL(`${origin}/dome-access`);
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
    return json({ error: error.message || 'Dome access check failed' }, 502);
  }
}
