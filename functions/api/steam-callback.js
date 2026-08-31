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

  const redirectParams = new URLSearchParams({ steam_id: steamId, steam_name: username });
  return Response.redirect(`${origin}/#profile?${redirectParams.toString()}`, 302);
}
