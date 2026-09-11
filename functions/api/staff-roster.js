/**
 * Public staff roster for the Community tab's "meet the team" listing.
 *
 * GET (no params) -> { owner: [{steamId, name, avatar}], senior: [...],
 *   admin: [...] }. Fetches the tier lists from the bridge Worker's
 * /admin-roster-public route, then enriches each Steam ID with its public
 * display name + avatar via Steam's GetPlayerSummaries — the same call
 * steam-callback.js already makes on login, reused here for a batch of
 * IDs at once (single comma-separated request, well under Steam's 100-id
 * cap for this size of roster). Falls back to the bare Steam ID as the
 * name if STEAM_API_KEY isn't configured or the lookup fails — never
 * blocks the roster from rendering.
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
  const { env } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  let tiers;
  try {
    const response = await fetch(`${origin}/admin-roster-public`, {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    tiers = await response.json();
  } catch (error) {
    return json({ error: error.message || 'Roster lookup failed' }, 502);
  }

  const allIds = [...new Set([...(tiers.owner || []), ...(tiers.senior || []), ...(tiers.admin || [])])];
  const profiles = {};

  if (allIds.length > 0 && env.STEAM_API_KEY) {
    try {
      const summaryUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${env.STEAM_API_KEY}&steamids=${allIds.join(',')}`;
      const summaryResponse = await fetch(summaryUrl);
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        for (const player of summaryData?.response?.players || []) {
          profiles[player.steamid] = { name: player.personaname, avatar: player.avatarmedium };
        }
      }
    } catch {
      // Fall through — every id below just falls back to its bare steamId.
    }
  }

  const enrich = (ids) => (ids || []).map((steamId) => ({
    steamId,
    name: profiles[steamId]?.name || steamId,
    avatar: profiles[steamId]?.avatar || null,
  }));

  return json({
    owner: enrich(tiers.owner),
    senior: enrich(tiers.senior),
    admin: enrich(tiers.admin),
  });
}
