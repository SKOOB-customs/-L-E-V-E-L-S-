/**
 * Whether a player has a persistent linked Discord account (written by
 * discord-callback.js when discord-login.js was started with ?steamId=).
 * Used by the Support tab to decide whether to show the ticket form or a
 * "Link your Discord" prompt — separate from the existing discord_id/
 * discord_name/discord_role redirect params, which are a local-only login
 * that doesn't persist anywhere server-side.
 *
 * GET ?steamId=X -> { linked: boolean, discordName: string | null }
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestGet({ request, env }) {
  if (!env.PARKED_KV) return json({ error: 'Discord link storage is not configured' }, 503);

  const steamId = new URL(request.url).searchParams.get('steamId');
  if (!steamId || !/^\d{17}$/.test(steamId)) {
    return json({ error: 'Missing or invalid steamId' }, 400);
  }

  const link = await env.PARKED_KV.get(`discord_link:${steamId}`, 'json');
  return json({ linked: !!link, discordName: link?.discordName || null });
}
