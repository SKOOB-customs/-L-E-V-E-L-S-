/**
 * Temporary diagnostic: tail of UE4SS.log (the mod's own console output)
 * readable straight from the Owner tab instead of Bropanel's file
 * manager. Added for a live PatternIndex investigation (2026-09-18) —
 * remove once that's resolved if nothing else ends up using it.
 *
 * GET ?grep= (optional) -> { lines: [...] }, proxied to the bridge
 * Worker's /mod-log-tail route, which re-verifies the caller is an
 * OWNER before returning anything. requesterSteamId comes from the
 * verified session, never a client-supplied field.
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
  const grep = url.searchParams.get('grep') || '';
  const list = url.searchParams.get('list') || '';

  try {
    const target = new URL(`${origin}/mod-log-tail`);
    target.searchParams.set('requesterSteamId', requesterSteamId);
    if (grep) target.searchParams.set('grep', grep);
    if (list) target.searchParams.set('list', list);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Mod log lookup failed' }, 502);
  }
}
