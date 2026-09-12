// Verifies the Steam OpenID response, looks up the public profile server-side, then redirects back
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const origin = url.origin;

  const verifyParams = new URLSearchParams(url.search);
  verifyParams.set('openid.mode', 'check_authentication');

  const verifyResponse = await fetch('https://steamcommunity.com/openid/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verifyParams.toString(),
  });
  const verifyText = await verifyResponse.text();

  if (!verifyText.includes('is_valid:true')) {
    return Response.redirect(`${origin}/#profile?steam_error=1`, 302);
  }

  const claimedId = url.searchParams.get('openid.claimed_id') || '';
  const steamIdMatch = claimedId.match(/(\d{17})$/);
  const steamId = steamIdMatch ? steamIdMatch[1] : null;

  if (!steamId) {
    return Response.redirect(`${origin}/#profile?steam_error=1`, 302);
  }

  let username = steamId;
  if (env.STEAM_API_KEY) {
    const summaryUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${env.STEAM_API_KEY}&steamids=${steamId}`;
    const summaryResponse = await fetch(summaryUrl);
    if (summaryResponse.ok) {
      const summaryData = await summaryResponse.json();
      username = summaryData?.response?.players?.[0]?.personaname || steamId;
    }
  }

  // Record every website login immediately, not on any batch/cron delay —
  // the admin-panel/friends-tab name-search directory was previously only
  // ever populated from the game server's own join logs (or a confirmed
  // friend's steamId), which meant a player who's only ever used the
  // website and never joined in-game or been friended was unsearchable by
  // name until they happened to do one of those things. This is a direct,
  // synchronous KV write right at login — safe to do unconditionally here
  // since a login is a rare, one-per-session event, nowhere near the
  // 1,000-writes/day free-tier ceiling that forced the batched/conditional
  // approach for the 5-minute currency-tick and join-log syncs elsewhere.
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
      players[steamId] = { name: username, lastLoginAt: Date.now() };
      await env.PARKED_KV.put('web_login_directory:index', JSON.stringify({ updatedAt: Date.now(), players }));
    } catch {
      // Never block a login over this — the name-search directory is a
      // convenience, not something login itself depends on.
    }
  }

  // Check if user is staff for automatic in-game permission status
  let staffRole = '';
  if (env.STAFF_STEAM_IDS) {
    try {
      const staffMap = typeof env.STAFF_STEAM_IDS === 'string'
        ? JSON.parse(env.STAFF_STEAM_IDS)
        : env.STAFF_STEAM_IDS;
      if (staffMap[steamId]) {
        staffRole = staffMap[steamId];
      }
    } catch {
      String(env.STAFF_STEAM_IDS).split(',').forEach(entry => {
        const [id, role] = entry.trim().split(':');
        if (id === steamId) staffRole = role || 'Admin';
      });
    }
  }

  const redirectParams = new URLSearchParams({
    steam_id: steamId,
    steam_name: username,
    ...(staffRole ? { staff_role: staffRole } : {}),
  });
  return Response.redirect(`${origin}/#profile?${redirectParams.toString()}`, 302);
}
