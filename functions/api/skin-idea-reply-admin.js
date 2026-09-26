/**
 * Owner reply into ANY skin-idea thread — the first owner reply is what
 * opens a thread up to the player at all (see the Worker's own "Skin idea
 * inbox" comment). Same admin-passkey gate as every other owner-tier
 * route, so an official-looking reply can't be posted from a borrowed/
 * still-logged-in session without re-entering the passkey.
 *
 * POST { ideaId, name, text } -> proxied to the bridge Worker's
 * /skin-idea-reply route (same route skin-idea-reply.js uses — the
 * Worker's own tier check decides whether this lands as an owner reply).
 * actorSteamId comes from the verified session, never a client-supplied
 * field.
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
  const { request, env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const actorSteamId = data.authedSteamId;
  if (!actorSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);
  if (!data.adminUnlocked) return json({ error: 'Enter your admin passkey to use the Admin Panel.' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    const response = await fetch(`${origin}/skin-idea-reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ ...body, actorSteamId }),
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Could not send that reply right now.' }, 502);
  }
}
