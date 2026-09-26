/**
 * A player's own reply into a skin-idea thread — only allowed once an
 * owner has already replied (the Worker's own gate). No admin passkey
 * needed, self-service action on the caller's own thread.
 *
 * POST { ideaId, name, text } -> proxied to the bridge Worker's
 * /skin-idea-reply route. actorSteamId comes from the verified session,
 * never a client-supplied field; name is a cosmetic display hint only.
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
