/**
 * Refreshes a player's own display name straight from Steam, rather than
 * relying on whatever was cached in localStorage at their last OAuth
 * login — a real reported case: a player renamed on Steam and the website
 * kept showing their old name indefinitely, since nothing ever re-checked
 * it outside of a fresh login. Polled periodically by script.js.
 *
 * Also keeps web_login_directory:index (the name-search directory
 * steam-callback.js writes at login time) in sync when a rename is
 * detected, so admin-panel/friends search reflects renames too, not just
 * the player's own header — but only writes when the name actually
 * changed, so this stays a rare write, not a per-poll one.
 *
 * GET ?steamId= -> { username: string }
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestGet({ request, env }) {
  if (!env.STEAM_API_KEY) return json({ error: 'Steam API is not configured' }, 503);

  const steamId = new URL(request.url).searchParams.get('steamId');
  if (!steamId || !/^\d{17}$/.test(steamId)) {
    return json({ error: 'Missing or invalid steamId' }, 400);
  }

  try {
    const summaryUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${env.STEAM_API_KEY}&steamids=${steamId}`;
    const response = await fetch(summaryUrl);
    if (!response.ok) return json({ error: 'Steam lookup failed' }, 502);
    const data = await response.json();
    const username = data?.response?.players?.[0]?.personaname;
    if (!username) return json({ error: 'Steam profile not found' }, 404);

    if (env.PARKED_KV) {
      try {
        const raw = await env.PARKED_KV.get('web_login_directory:index');
        let players = {};
        if (raw) {
          try {
            players = JSON.parse(raw).players || {};
          } catch {
            players = {};
          }
        }
        if (players[steamId]?.name !== username) {
          players[steamId] = { name: username, lastLoginAt: players[steamId]?.lastLoginAt || Date.now() };
          await env.PARKED_KV.put('web_login_directory:index', JSON.stringify({ updatedAt: Date.now(), players }));
        }
      } catch {
        // best-effort — the player's own name refresh below still works either way
      }
    }

    return json({ username });
  } catch (error) {
    return json({ error: error.message || 'Steam username refresh failed' }, 502);
  }
}
