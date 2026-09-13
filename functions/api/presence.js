/**
 * Batched website-presence read for the Friends tab — one request covers
 * every friend's steamId at once rather than one round trip each, since
 * it's all backed by a single presence:index KV key anyway (see
 * heartbeat.js). "Online" means a heartbeat within the last 5 minutes,
 * generous enough to cover a couple of missed 3-minute heartbeats without
 * flickering a still-active player to "offline."
 *
 * GET ?steamIds=a,b,c -> { presence: { [steamId]: { online, lastSeenAt } } }
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export async function onRequestGet({ request, env }) {
  if (!env.PARKED_KV) return json({ presence: {} });

  const steamIdsParam = new URL(request.url).searchParams.get('steamIds') || '';
  const steamIds = steamIdsParam.split(',').map((s) => s.trim()).filter((s) => /^\d{17}$/.test(s));
  if (steamIds.length === 0) return json({ presence: {} });

  const index = await env.PARKED_KV.get('presence:index', 'json');
  const now = Date.now();
  const presence = {};
  steamIds.forEach((steamId) => {
    const lastSeenAt = index?.[steamId] || null;
    presence[steamId] = {
      online: !!lastSeenAt && (now - lastSeenAt) < ONLINE_WINDOW_MS,
      lastSeenAt,
    };
  });

  return json({ presence });
}
