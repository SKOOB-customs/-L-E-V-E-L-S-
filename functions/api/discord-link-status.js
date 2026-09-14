/**
 * Whether a player has a persistent linked Discord account (written by
 * discord-callback.js when discord-login.js was started with ?steamId=).
 * Used by the Support tab to decide whether to show the ticket form or a
 * "Link your Discord" prompt — separate from the existing discord_id/
 * discord_name/discord_role redirect params, which are a local-only login
 * that doesn't persist anywhere server-side.
 *
 * GET -> { linked: boolean, discordName: string | null }
 * steamId comes from the verified session, not a client-supplied query
 * param.
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestGet({ env, data }) {
  if (!env.PARKED_KV) return json({ error: 'Discord link storage is not configured' }, 503);

  const steamId = data.authedSteamId;
  if (!steamId) return json({ linked: false, discordName: null });

  const link = await env.PARKED_KV.get(`discord_link:${steamId}`, 'json');
  return json({ linked: !!link, discordName: link?.discordName || null });
}
