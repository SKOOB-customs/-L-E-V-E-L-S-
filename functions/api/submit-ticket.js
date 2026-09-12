/**
 * Website ticket submission: posts straight into the Discord ticket channel
 * via a webhook, replacing the old "type it all into Discord yourself" flow
 * with an auto-filled form (steamId comes from the caller's own logged-in
 * Steam session, not manually typed — same trust model as everywhere else
 * on this site, e.g. currency-balance's ?steamId=).
 *
 * Requires a Discord webhook URL created in the ticket channel's Integrations
 * settings, set as the DISCORD_TICKET_WEBHOOK_URL environment variable on
 * this Cloudflare Pages project (same "guard if unset, use directly" pattern
 * discord-callback.js already uses for DISCORD_CLIENT_ID/_SECRET) — nothing
 * in this codebase can create that webhook on its own.
 *
 * POST { steamId, username?, reason, incidentTime, dinoLabel? } -> {ok:true}
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const MAX_REASON_LENGTH = 1500;

export async function onRequestPost({ request, env }) {
  if (!env.DISCORD_TICKET_WEBHOOK_URL) {
    return json({ error: 'Ticket submission is not configured' }, 503);
  }

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

  const fields = [
    { name: 'Steam ID', value: steamId, inline: true },
    { name: 'Player', value: username || steamId, inline: true },
    { name: 'Time it happened', value: incidentTime, inline: false },
    { name: 'Dino', value: dinoLabel || 'Not specified', inline: false },
    { name: 'Reason', value: reason, inline: false },
  ];

  const payload = {
    embeds: [{
      title: 'New Website Ticket',
      color: 0xe74c3c,
      fields,
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    const response = await fetch(env.DISCORD_TICKET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return json({ error: `Discord webhook rejected the ticket (${response.status})` }, 502);
    }
  } catch (error) {
    return json({ error: error.message || 'Ticket submission failed' }, 502);
  }

  return json({ ok: true });
}
