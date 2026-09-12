/**
 * Discord Interactions Endpoint — registered as this Application's
 * "Interactions Endpoint URL" in the Developer Portal. Handles the ticket
 * Claim button posted by submit-ticket.js.
 *
 * Every request must be verified as genuinely from Discord via Ed25519
 * (X-Signature-Ed25519/X-Signature-Timestamp against DISCORD_PUBLIC_KEY) —
 * Discord disables the endpoint if verification isn't correct, and PINGs
 * it once immediately when the URL is first saved. Cloudflare's WebCrypto
 * supports this natively via the non-standard 'NODE-ED25519' algorithm
 * name (confirmed working in the Workers/Pages runtime) — no external
 * signature-verification library or build step needed.
 *
 * Claim flow: checks the clicking member has DISCORD_TICKET_CLAIM_ROLE_ID,
 * creates a new private channel visible only to that member (+ the bot)
 * via a permission overwrite, posts the full ticket details there, then
 * responds by updating the original message in place with a redacted
 * "claimed by" stub and no button — so other staff (including other
 * claim-role holders) can no longer see the reason/steamId/dino once
 * claimed. The player's own visibility lives on the website instead (see
 * functions/api/my-tickets.js), since a random player isn't a member of
 * the staff-only ticket channel.
 */

const DISCORD_API = 'https://discord.com/api/v10';
const VIEW_CHANNEL = '1024'; // 1 << 10 — Discord permission overwrites use string-encoded bitfields

const hexToBytes = (hex) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
};

const verifySignature = async (publicKeyHex, signatureHex, timestamp, rawBody) => {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(publicKeyHex),
    { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' },
    false,
    ['verify'],
  );
  const message = new TextEncoder().encode(timestamp + rawBody);
  return crypto.subtle.verify('NODE-ED25519', key, hexToBytes(signatureHex), message);
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const ephemeral = (content) => json({ type: 4, data: { content, flags: 64 } });

const discordFetch = (env, path, options = {}) => fetch(`${DISCORD_API}${path}`, {
  ...options,
  headers: {
    Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  },
});

const handleClaim = async (interaction, env) => {
  const ticketId = interaction.data.custom_id.slice('claim:'.length);
  if (!env.PARKED_KV) return ephemeral('Ticket storage is not configured.');

  const raw = await env.PARKED_KV.get(`tickets:${ticketId}`);
  if (!raw) return ephemeral('This ticket no longer exists.');

  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return ephemeral('This ticket record is corrupted.');
  }
  if (record.status === 'claimed') {
    return ephemeral(`Already claimed by ${record.claimedByName || 'someone'}.`);
  }

  const claimRoleId = env.DISCORD_TICKET_CLAIM_ROLE_ID;
  const memberRoles = interaction.member?.roles || [];
  if (!claimRoleId || !memberRoles.includes(claimRoleId)) {
    return ephemeral("You don't have permission to claim tickets.");
  }
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) {
    return ephemeral('Ticket claiming is not fully configured.');
  }

  const claimerId = interaction.member.user.id;
  const claimerName = interaction.member.nick
    || interaction.member.user.global_name
    || interaction.member.user.username;

  let privateChannelId = null;
  try {
    const channelResponse = await discordFetch(env, `/guilds/${env.DISCORD_GUILD_ID}/channels`, {
      method: 'POST',
      body: JSON.stringify({
        name: `ticket-${ticketId.slice(0, 8)}`,
        type: 0,
        permission_overwrites: [
          { id: env.DISCORD_GUILD_ID, type: 0, deny: VIEW_CHANNEL },
          { id: claimerId, type: 1, allow: VIEW_CHANNEL },
        ],
        ...(env.DISCORD_TICKET_CATEGORY_ID ? { parent_id: env.DISCORD_TICKET_CATEGORY_ID } : {}),
      }),
    });
    if (channelResponse.ok) {
      const channel = await channelResponse.json();
      privateChannelId = channel.id;
      await discordFetch(env, `/channels/${privateChannelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          embeds: [{
            title: 'Ticket details',
            color: 0xe74c3c,
            fields: [
              { name: 'Steam ID', value: record.reporterSteamId, inline: true },
              { name: 'Player', value: record.reporterName, inline: true },
              { name: 'Discord', value: `<@${record.reporterDiscordId}>`, inline: true },
              { name: 'Time it happened', value: record.incidentTime, inline: false },
              { name: 'Dino', value: record.dinoLabel || 'Not specified', inline: false },
              { name: 'Reason', value: record.reason, inline: false },
            ],
          }],
        }),
      });
    } else {
      console.error('Ticket claim channel creation failed:', channelResponse.status, await channelResponse.text());
    }
  } catch (error) {
    console.error('Ticket claim channel creation failed:', error);
  }

  record.status = 'claimed';
  record.claimedByDiscordId = claimerId;
  record.claimedByName = claimerName;
  record.claimedAt = Date.now();
  record.privateChannelId = privateChannelId;

  try {
    await env.PARKED_KV.put(`tickets:${ticketId}`, JSON.stringify(record));
    const indexRaw = await env.PARKED_KV.get('tickets:index');
    if (indexRaw) {
      const index = JSON.parse(indexRaw);
      if (Array.isArray(index)) {
        const entry = index.find((t) => t.ticketId === ticketId);
        if (entry) {
          entry.status = 'claimed';
          entry.claimedByName = claimerName;
        }
        await env.PARKED_KV.put('tickets:index', JSON.stringify(index));
      }
    }
  } catch (error) {
    console.error('Ticket claim KV update failed:', error);
  }

  return json({
    type: 7,
    data: {
      embeds: [{
        title: 'Ticket claimed',
        color: 0x7ad694,
        description: `🔒 Claimed by <@${claimerId}>${privateChannelId ? ` — moved to <#${privateChannelId}>` : ''}.`,
      }],
      components: [],
    },
  });
};

export async function onRequestPost({ request, env }) {
  if (!env.DISCORD_PUBLIC_KEY) return new Response('Interactions endpoint is not configured', { status: 503 });

  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  const rawBody = await request.text();
  if (!signature || !timestamp) return new Response('Missing signature headers', { status: 401 });

  let verified = false;
  try {
    verified = await verifySignature(env.DISCORD_PUBLIC_KEY, signature, timestamp, rawBody);
  } catch {
    verified = false;
  }
  if (!verified) return new Response('Invalid request signature', { status: 401 });

  let interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (interaction.type === 1) return json({ type: 1 }); // PING, required for Discord's endpoint verification

  if (interaction.type === 3 && typeof interaction.data?.custom_id === 'string' && interaction.data.custom_id.startsWith('claim:')) {
    return handleClaim(interaction, env);
  }

  return ephemeral('Unsupported interaction.');
}
