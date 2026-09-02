const stateCookieName = 'levels_discord_oauth_state';

export async function onRequestGet({ request, env }) {
  if (!env.DISCORD_CLIENT_ID) {
    return new Response('Discord login is not configured.', { status: 503 });
  }

  const url = new URL(request.url);
  const state = crypto.randomUUID();
  const redirectUri = `${url.origin}/api/discord-callback`;
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds.members.read',
    state,
  });

  const response = Response.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`, 302);
  response.headers.append('Set-Cookie', `${stateCookieName}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/discord-callback; Max-Age=600`);
  return response;
}