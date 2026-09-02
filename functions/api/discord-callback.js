const stateCookieName = 'levels_discord_oauth_state';
const roleOrder = ['Owner', 'Admin', 'Moderator'];

const getCookie = (request, name) => {
  const cookies = request.headers.get('Cookie') || '';
  return cookies.split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`))?.slice(name.length + 1) || '';
};

const redirectToProfile = (origin, params = {}) => {
  const query = new URLSearchParams(params);
  return Response.redirect(`${origin}/#profile?${query.toString()}`, 302);
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const origin = url.origin;
  const state = url.searchParams.get('state') || '';

  if (url.searchParams.get('error') || !state || state !== getCookie(request, stateCookieName)) {
    return redirectToProfile(origin, { discord_error: 'authorization' });
  }

  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.DISCORD_GUILD_ID) {
    return redirectToProfile(origin, { discord_error: 'configuration' });
  }

  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: url.searchParams.get('code') || '',
        redirect_uri: `${origin}/api/discord-callback`,
      }).toString(),
    });
    if (!tokenResponse.ok) throw new Error('Token exchange failed');

    const token = await tokenResponse.json();
    const [userResponse, memberResponse] = await Promise.all([
      fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      }),
      fetch(`https://discord.com/api/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      }),
    ]);
    if (!userResponse.ok || !memberResponse.ok) throw new Error('Guild membership lookup failed');

    const user = await userResponse.json();
    const member = await memberResponse.json();
    const configuredRoles = {
      Owner: env.DISCORD_OWNER_ROLE_ID,
      Admin: env.DISCORD_ADMIN_ROLE_ID,
      Moderator: env.DISCORD_MODERATOR_ROLE_ID,
    };
    const staffRole = roleOrder.find((role) => configuredRoles[role] && member.roles.includes(configuredRoles[role])) || 'Player';
    const username = user.global_name || user.username || 'Discord user';
    return redirectToProfile(origin, {
      discord_id: user.id,
      discord_name: username,
      discord_role: staffRole,
    });
  } catch {
    return redirectToProfile(origin, { discord_error: 'membership' });
  }
}