/**
 * Admin Panel passkey recovery: an owner-tier admin (already unlocked
 * themselves) can clear a locked-out admin's passkey record, so that
 * admin gets prompted to set a fresh one next time they open the panel.
 * Otherwise a forgotten passkey has no recovery path at all.
 *
 * POST { targetSteamId } -> {ok:true}
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

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);
  if (!data.adminUnlocked) return json({ error: 'Enter your admin passkey to use the Admin Panel.' }, 403);
  if (!env.PARKED_KV) return json({ error: 'Passkey storage is not configured' }, 503);

  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const targetSteamId = body?.targetSteamId;
  if (!isValidSteamId(targetSteamId)) return json({ error: 'Missing or invalid targetSteamId' }, 400);

  try {
    const target = new URL(`${origin}/admin-tier`);
    target.searchParams.set('steamId', steamId);
    const tierResponse = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const tierData = await tierResponse.json();
    if (tierData.tier !== 'owner') return json({ error: 'Owner access required.' }, 403);
  } catch (error) {
    return json({ error: error.message || 'Admin tier lookup failed' }, 502);
  }

  try {
    await env.PARKED_KV.delete(`admin_passkey:${targetSteamId}`);
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'Passkey reset failed' }, 502);
  }
}
