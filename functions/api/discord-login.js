const stateCookieName = 'levels_discord_oauth_state';

// When the caller has a verified Steam session, this turns a plain
// "verify my Discord roles" login into a persistent link between that
// Steam account and whichever Discord account completes this OAuth flow
// (see discord-callback.js) — e.g. the ticket form uses this so a ticket
// submission can later require a real linked Discord identity. Riding it
// through the state/CSRF cookie (rather than a second cookie) is safe:
// the uuid portion still has to match exactly for the callback to
// proceed, and a steamId is just a public 17-digit number, not a secret.
// The steamId itself comes from the verified session (context.data.authedSteamId,
// set by _middleware.js) rather than a client-supplied ?steamId= query
// param — that used to let anyone link an arbitrary steamId's Discord
// identity to their own Discord account.
export async function onRequestGet({ request, env, data }) {
  if (!env.DISCORD_CLIENT_ID) {
    return new Response('Discord login is not configured.', { status: 503 });
  }

  const steamId = data.authedSteamId || '';
  const state = /^\d{17}$/.test(steamId) ? `${crypto.randomUUID()}:${steamId}` : crypto.randomUUID();
  const redirectUri = `${new URL(request.url).origin}/api/discord-callback`;
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds.members.read',
    state,
  });

  // Response.redirect() returns a Response whose headers are spec-immutable
  // — appending Set-Cookie to it throws "Can't modify immutable headers."
  // (confirmed live: this crashed every single Discord login attempt with
  // an unhandled 500). Building the redirect manually via `new Response`
  // gives a real, mutable Headers object instead.
  const headers = new Headers({ Location: `https://discord.com/oauth2/authorize?${params.toString()}` });
  headers.append('Set-Cookie', `${stateCookieName}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/discord-callback; Max-Age=600`);
  return new Response(null, { status: 302, headers });
}