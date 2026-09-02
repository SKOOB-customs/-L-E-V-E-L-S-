export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.DISCORD_GUILD_ID || !env.DISCORD_BOT_TOKEN) {
    return Response.redirect(`${origin}/#profile?discord_error=config`, 302);
  }

  const redirectUri = `${origin}/api/discord-callback`;
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds.members.read',
  });

  return Response.redirect(`https://discord.com/oauth2/authorize?${params}`, 302);
}