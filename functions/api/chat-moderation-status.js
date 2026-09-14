/**
 * Chat moderation: current ban/timeout status for a target player, used
 * to pre-fill the moderation modal when it opens (e.g. the ban checkbox
 * already checked if they're already banned). Admin/owner only —
 * re-validated by tier on the Worker.
 *
 * GET ?targetSteamId= -> proxied to the bridge Worker's
 * /chat-moderation-status route. requesterSteamId comes from the
 * verified session, not a client-supplied field.
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

export async function onRequestGet(context) {
  const { request, env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const requesterSteamId = data.authedSteamId;
  if (!requesterSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  const targetSteamId = new URL(request.url).searchParams.get('targetSteamId');
  if (!isValidSteamId(targetSteamId)) return json({ error: 'Missing or invalid targetSteamId' }, 400);

  try {
    const target = new URL(`${origin}/chat-moderation-status`);
    target.searchParams.set('requesterSteamId', requesterSteamId);
    target.searchParams.set('targetSteamId', targetSteamId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Moderation status lookup failed' }, 502);
  }
}
