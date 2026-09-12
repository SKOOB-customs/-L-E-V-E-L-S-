/**
 * Name-search autocomplete source list — used by the admin panel's 3
 * target fields and the Friends tab's "Add a friend" field. Any signed-in
 * player can call this (not admin-gated).
 *
 * GET ?requesterSteamId= -> proxied to the bridge Worker's
 * /player-directory route (join-log-derived: name + steamId for anyone
 * who's actually connected to this game server), then enriched with any
 * confirmed friend who's never joined the server at all — a real reported
 * case (added as a friend by Steam ID, but unsearchable by name since the
 * join-log directory has nothing on them). The Worker hands back those
 * steamIds unnamed (it has no STEAM_API_KEY, that's Pages-only) and this
 * resolves their real names via GetPlayerSummaries, same call
 * friends.js/staff-roster.js already make.
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
    if (response.ok && Array.isArray(data.unnamedSteamIds) && data.unnamedSteamIds.length > 0 && env.STEAM_API_KEY) {
      try {
        const summaryUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${env.STEAM_API_KEY}&steamids=${data.unnamedSteamIds.join(',')}`;
        const summaryResponse = await fetch(summaryUrl);
        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json();
          for (const player of summaryData?.response?.players || []) {
            data.players.push({ steamId: player.steamid, name: player.personaname, lastSeen: null });
          }
        }
      } catch {
        // Fall through — the join-log-derived players list above still returns fine either way.
      }
    }
    delete data.unnamedSteamIds;
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Player directory lookup failed' }, 502);
  }
}
