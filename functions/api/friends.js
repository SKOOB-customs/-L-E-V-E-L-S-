/**
 * Friends: the caller's own friend list.
 *
 * GET ?steamId= -> proxied to the bridge Worker's /friends route, then
 * enriched with each friend's real Steam display name via
 * GetPlayerSummaries — same call staff-roster.js already makes. The
 * Worker's own KV records only ever hold a steamId, and a join-log-derived
 * directory (used elsewhere for admin-panel/friend-request name search)
 * only covers players who've actually connected to this game server, which
 * a friend added by Steam ID alone might never have done — Steam's own API
 * resolves a name for any steamId regardless. Falls back to the bare
 * steamId if STEAM_API_KEY isn't configured or the lookup fails.
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
    const target = new URL(`${origin}/friends`);
    target.searchParams.set('steamId', steamId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const data = await response.json();
    if (response.ok && Array.isArray(data.friends)) {
      const names = {};
      if (data.friends.length > 0 && env.STEAM_API_KEY) {
        try {
          const ids = [...new Set(data.friends.map((f) => f.steamId))];
          const summaryUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${env.STEAM_API_KEY}&steamids=${ids.join(',')}`;
          const summaryResponse = await fetch(summaryUrl);
          if (summaryResponse.ok) {
            const summaryData = await summaryResponse.json();
            for (const player of summaryData?.response?.players || []) {
              names[player.steamid] = player.personaname;
            }
          }
        } catch {
          // Fall through — every friend below just falls back to its bare steamId.
        }
      }
      data.friends = data.friends.map((f) => ({ ...f, name: names[f.steamId] || f.steamId }));
    }
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Friends lookup failed' }, 502);
  }
}
