/**
 * Chat moderation: delete a message for everyone (right-click menu in the
 * chat sidebar, admin/owner only — re-validated by tier on the Worker).
 *
 * POST { messageId } -> proxied to the bridge Worker's
 * /chat-delete-message route. moderatorSteamId comes from the verified
 * session, not a client-supplied field.
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

  const moderatorSteamId = data.authedSteamId;
  if (!moderatorSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const { messageId } = body || {};
  if (typeof messageId !== 'string' || !messageId) {
    return json({ error: 'Missing or invalid messageId' }, 400);
  }

  try {
    const response = await fetch(`${origin}/chat-delete-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ moderatorSteamId, messageId }),
    });
    const data2 = await response.json();
    return json(data2, response.status);
  } catch (error) {
    return json({ error: error.message || 'Message delete failed' }, 502);
  }
}
