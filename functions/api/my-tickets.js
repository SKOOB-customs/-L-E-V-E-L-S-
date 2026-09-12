/**
 * A player's own submitted tickets and their current status. Once a ticket
 * is claimed, the full details move into a private Discord channel the
 * player has no access to (see discord-interactions.js) — this is how the
 * player still gets to see their ticket exists and its status ("Open" /
 * "Claimed by X") without a live two-way chat feature.
 *
 * GET ?steamId=X -> { tickets: [{ticketId, status, reason, dinoLabel, createdAt, claimedByName}] }
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestGet({ request, env }) {
  if (!env.PARKED_KV) return json({ error: 'Ticket storage is not configured' }, 503);

  const steamId = new URL(request.url).searchParams.get('steamId');
  if (!steamId || !/^\d{17}$/.test(steamId)) {
    return json({ error: 'Missing or invalid steamId' }, 400);
  }

  const index = await env.PARKED_KV.get('tickets:index', 'json');
  const tickets = Array.isArray(index) ? index.filter((t) => t.reporterSteamId === steamId) : [];
  return json({ tickets });
}
