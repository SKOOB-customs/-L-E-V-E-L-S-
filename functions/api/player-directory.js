/**
 * Admin panel: name-search autocomplete source list.
 *
 * GET ?requesterSteamId= -> proxied to the bridge Worker's
 * /player-directory route, which itself re-checks the requester's admin
 * tier server-side (this proxy is not the security boundary).
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
  const { request, env } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const url = new URL(request.url);
  const requesterSteamId = url.searchParams.get('requesterSteamId');
  if (!requesterSteamId || !/^\d{17}$/.test(requesterSteamId)) {
    return json({ error: 'Missing or invalid requesterSteamId' }, 400);
  }

  try {
    const target = new URL(`${origin}/player-directory`);
    target.searchParams.set('requesterSteamId', requesterSteamId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Player directory lookup failed' }, 502);
  }
}
