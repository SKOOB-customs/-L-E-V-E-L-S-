const roleFromMember = (member, env) => {
  const roleIds = new Set(member.roles || []);
  if (env.DISCORD_OWNER_ROLE_ID && roleIds.has(env.DISCORD_OWNER_ROLE_ID)) return 'Owner';
  if (env.DISCORD_ADMIN_ROLE_ID && roleIds.has(env.DISCORD_ADMIN_ROLE_ID)) return 'Admin';
  if (env.DISCORD_MODERATOR_ROLE_ID && roleIds.has(env.DISCORD_MODERATOR_ROLE_ID)) return 'Moderator';
  return 'Player';
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const redirectUri = `${origin}/api/discord-callback`;

  if (!code || !env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.DISCORD_GUILD_ID || !env.DISCORD_BOT_TOKEN) {
    return Response.redirect(`${origin}/#profile?discord_error=1`, 302);
  }

  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) return Response.redirect(`${origin}/#profile?discord_error=1`, 302);
  const { access_token: accessToken } = await tokenResponse.json();
  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userResponse.ok) return Response.redirect(`${origin}/#profile?discord_error=1`, 302);
  const user = await userResponse.json();

  const memberResponse = await fetch(`https://discord.com/api/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
  });
  if (!memberResponse.ok) return Response.redirect(`${origin}/#profile?discord_error=member`, 302);
  const member = await memberResponse.json();
  const role = roleFromMember(member, env);
  const username = user.global_name || user.username;
  const params = new URLSearchParams({ discord_id: user.id, discord_name: username, discord_role: role });

  return Response.redirect(`${origin}/#profile?${params}`, 302);
}