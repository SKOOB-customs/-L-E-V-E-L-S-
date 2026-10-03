/**
 * Proximity Voice (Phase 0): starts a new Cloudflare Calls session.
 * Called twice per browser — once for the "send" session (your own mic)
 * and once for the "receive" session (everyone else's incoming tracks).
 *
 * POST (no body) -> proxied to the bridge Worker's /voice-session-new
 * route, which holds the Calls App Secret server-side (Cloudflare's own
 * docs are explicit this must never reach the browser) and does the
 * actual Cloudflare Calls API call.
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
  const { env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  if (!data.authedSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  try {
    const response = await fetch(`${origin}/voice-session-new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Voice session request failed' }, 502);
  }
}
