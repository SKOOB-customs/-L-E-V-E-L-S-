// Redirects the user to Steam's OpenID login, scoped to whatever origin served this request
export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  const returnTo = `${origin}/api/steam-callback`;

  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  return Response.redirect(`https://steamcommunity.com/openid/login?${params.toString()}`, 302);
}
