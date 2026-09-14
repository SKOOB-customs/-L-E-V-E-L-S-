/**
 * A player's own submitted tickets and their current status. Once a ticket
 * is claimed, the full details move into a private Discord channel the
 * player has no access to (see discord-interactions.js) — this is how the
 * player still gets to see their ticket exists and its status ("Open" /
 * "Claimed by X") without a live two-way chat feature.
 *
 * GET -> { tickets: [{ticketId, status, reason, dinoLabel, createdAt, claimedByName}] }
 * steamId comes from the verified session, not a client-supplied query
 * param (this used to accept ?steamId= directly, which meant anyone
 * could read anyone else's ticket history just by knowing their steamId).
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestGet({ env, data }) {
  if (!env.PARKED_KV) return json({ error: 'Ticket storage is not configured' }, 503);

  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  const index = await env.PARKED_KV.get('tickets:index', 'json');
  const tickets = Array.isArray(index) ? index.filter((t) => t.reporterSteamId === steamId) : [];
  return json({ tickets });
}
