/**
 * A player's own view of one skin-idea thread — only reachable once an
 * owner has actually replied to it (the Worker's own gate; see its
 * "Skin idea inbox" comment for why). No admin passkey needed, this is a
 * self-service read of the caller's own submission, same posture as
 * dino-history.js vs its admin-tier sibling dino-history-admin.js.
 *
 * GET ?ideaId= -> proxied to the bridge Worker's /skin-idea-thread route.
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
