/**
 * Website ticket submission: posts into the Discord ticket channel via the
 * bot (not a plain webhook — a webhook can't receive button clicks, and
 * this needs an interactive Claim button; see discord-interactions.js),
 * and persists a record in KV so staff-side claiming and the player's own
 * "My Tickets" status view both have something to read.
 *
 * Requires a linked Discord account (functions/api/discord-callback.js
 * writes discord_link:<steamId> when discord-login.js was started with
 * ?steamId=) — enforced here server-side, not just as a client-side UI
 * gate, since claiming/notifying depends on a real Discord identity.
 *
 * Tickets are low-volume (nothing like the currency/park polling cadence),
 * so direct KV writes per submission are fine — no local-file+cron
 * aggregation needed here, unlike the high-frequency per-player syncs.
 *
 * POST { steamId, username?, reason, incidentTime, dinoLabel? } -> {ok:true, ticketId}
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const MAX_REASON_LENGTH = 1500;
const MAX_TICKET_INDEX_ENTRIES = 500;
const DISCORD_API = 'https://discord.com/api/v10';

export async function onRequestPost({ request, env }) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_TICKET_CHANNEL_ID) {
    return json({ error: 'Ticket submission is not configured' }, 503);
  }
  if (!env.PARKED_KV) return json({ error: 'Ticket storage is not configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const steamId = typeof body.steamId === 'string' ? body.steamId : '';
  if (!/^\d{17}$/.test(steamId)) return json({ error: 'Missing or invalid steamId' }, 400);

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return json({ error: 'Reason is required' }, 400);
  if (reason.length > MAX_REASON_LENGTH) {
    return json({ error: `Reason must be ${MAX_REASON_LENGTH} characters or fewer` }, 400);
  }

  const incidentTime = typeof body.incidentTime === 'string' ? body.incidentTime : '';
  if (!incidentTime) return json({ error: 'When it happened is required' }, 400);

  const username = typeof body.username === 'string' && body.username.trim() ? body.username.trim() : null;
  const dinoLabel = typeof body.dinoLabel === 'string' && body.dinoLabel.trim() ? body.dinoLabel.trim() : null;

  const link = await env.PARKED_KV.get(`discord_link:${steamId}`, 'json');
  if (!link) {
    return json({ error: 'Link your Discord account first (Support tab).' }, 403);
  }

  const ticketId = crypto.randomUUID();
  const createdAt = Date.now();

  const embed = {
    title: 'New Website Ticket',
    color: 0xe74c3c,
    fields: [
      { name: 'Steam ID', value: steamId, inline: true },
      { name: 'Player', value: username || steamId, inline: true },
      { name: 'Discord', value: `<@${link.discordId}>`, inline: true },
      { name: 'Time it happened', value: incidentTime, inline: false },
      { name: 'Dino', value: dinoLabel || 'Not specified', inline: false },
      { name: 'Reason', value: reason, inline: false },
    ],
    timestamp: new Date(createdAt).toISOString(),
  };
  const claimButtonRow = {
    type: 1,
    components: [
      { type: 2, style: 3, custom_id: `claim:${ticketId}`, label: 'Claim' },
    ],
  };

  let discordMessage;
  try {
    const response = await fetch(`${DISCORD_API}/channels/${env.DISCORD_TICKET_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ embeds: [embed], components: [claimButtonRow] }),
    });
    if (!response.ok) {
      return json({ error: `Discord rejected the ticket (${response.status})` }, 502);
    }
    discordMessage = await response.json();
  } catch (error) {
    return json({ error: error.message || 'Ticket submission failed' }, 502);
  }

  const record = {
    ticketId,
    reporterSteamId: steamId,
    reporterDiscordId: link.discordId,
    reporterName: username || steamId,
    reason,
    incidentTime,
    dinoLabel,
    status: 'open',
    claimedByDiscordId: null,
    claimedByName: null,
    createdAt,
    claimedAt: null,
    discordMessageId: discordMessage.id,
    discordChannelId: discordMessage.channel_id,
    privateChannelId: null,
  };

  try {
    await env.PARKED_KV.put(`tickets:${ticketId}`, JSON.stringify(record));

    const indexRaw = await env.PARKED_KV.get('tickets:index');
    let index = [];
    if (indexRaw) {
      try {
        index = JSON.parse(indexRaw);
        if (!Array.isArray(index)) index = [];
      } catch {
        index = [];
      }
    }
    index.unshift({
      ticketId,
      reporterSteamId: steamId,
      status: 'open',
      reason,
      dinoLabel,
      createdAt,
      claimedByName: null,
    });
    if (index.length > MAX_TICKET_INDEX_ENTRIES) index = index.slice(0, MAX_TICKET_INDEX_ENTRIES);
    await env.PARKED_KV.put('tickets:index', JSON.stringify(index));
  } catch (error) {
    // The Discord message already went out — surface success anyway rather
    // than telling the player their ticket failed when staff already have
    // it, but log-worthy in principle (no logging sink here beyond this).
    console.error('Ticket KV persistence failed:', error);
  }

  return json({ ok: true, ticketId });
}
