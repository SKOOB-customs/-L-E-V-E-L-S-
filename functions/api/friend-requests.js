/**
 * Friends: the caller's own pending incoming friend requests.
 *
 * GET ?steamId= -> proxied to the bridge Worker's /friend-requests route,
 * enriched with the requester's real Steam display name (fromName) via
 * GetPlayerSummaries — see friends.js for why this can't just use the
 * join-log-derived directory.
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
  const steamId = url.searchParams.get('steamId');
  if (!steamId || !/^\d{17}$/.test(steamId)) {
    return json({ error: 'Missing or invalid steamId' }, 400);
  }

  try {
    const target = new URL(`${origin}/friend-requests`);
    target.searchParams.set('steamId', steamId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const data = await response.json();
    if (response.ok && Array.isArray(data.requests)) {
      const names = {};
      if (data.requests.length > 0 && env.STEAM_API_KEY) {
        try {
          const ids = [...new Set(data.requests.map((r) => r.fromSteamId))];
          const summaryUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${env.STEAM_API_KEY}&steamids=${ids.join(',')}`;
          const summaryResponse = await fetch(summaryUrl);
          if (summaryResponse.ok) {
            const summaryData = await summaryResponse.json();
            for (const player of summaryData?.response?.players || []) {
              names[player.steamid] = player.personaname;
            }
          }
        } catch {
          // Fall through — every request below just falls back to its bare steamId.
        }
      }
      data.requests = data.requests.map((r) => ({ ...r, fromName: names[r.fromSteamId] || r.fromSteamId }));
    }
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Friend requests lookup failed' }, 502);
  }
}
