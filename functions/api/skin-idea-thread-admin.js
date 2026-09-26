/**
 * Owner view of ANY skin-idea thread, not just the caller's own — unlike
 * skin-idea-thread.js, which was deliberately scoped to self-view only.
 * Same admin-passkey gate as every other owner-tier route.
 *
 * GET ?ideaId= -> proxied to the bridge Worker's /skin-idea-thread route
 * (same route skin-idea-thread.js uses — the Worker's own tier check is
 * what actually grants the wider access here). requesterSteamId comes
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
  const { request, env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const requesterSteamId = data.authedSteamId;
  if (!requesterSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);
  if (!data.adminUnlocked) return json({ error: 'Enter your admin passkey to use the Admin Panel.' }, 403);

  const url = new URL(request.url);
  const ideaId = url.searchParams.get('ideaId');
  if (!ideaId) return json({ error: 'Missing ideaId' }, 400);

  try {
    const target = new URL(`${origin}/skin-idea-thread`);
    target.searchParams.set('requesterSteamId', requesterSteamId);
    target.searchParams.set('ideaId', ideaId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Skin idea thread lookup failed' }, 502);
  }
}
