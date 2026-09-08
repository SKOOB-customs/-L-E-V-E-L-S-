/**
 * Inventory API — parked dino snapshots (reference log only, see index.html's
 * Inventory tab note for why this can't despawn/respawn anything in-game).
 *
 * Storage: Cloudflare KV, one entry per Steam ID at key `parked:<steamId>`.
 * A player may only have one parked snapshot at a time — they must unpark
 * (DELETE) before parking again, which is the only practical way to bound
 * how many snapshots someone can accumulate without a real in-game despawn.
 *
 * GET    ?steam_id=X   -> { parked: {...} | null }
 * POST   { steam_id }  -> re-fetches the player's LIVE dino server-side (never
 *                         trusts client-submitted stats) and parks it.
 * DELETE ?steam_id=X   -> unparks (deletes) the entry.
 */

import { fetchLiveDino } from '../_lib/fetchLiveDino.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const isValidSteamId = (id) => typeof id === 'string' && /^\d{17}$/.test(id);

export async function onRequestGet(context) {
  const { request, env } = context;
  const steamId = new URL(request.url).searchParams.get('steam_id');
  if (!isValidSteamId(steamId)) return json({ error: 'Missing or invalid steam_id' }, 400);
  if (!env.INVENTORY_KV) return json({ error: 'Inventory storage is not configured' }, 503);

  const parked = await env.INVENTORY_KV.get(`parked:${steamId}`, 'json');
  return json({ parked: parked || null });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.INVENTORY_KV) return json({ error: 'Inventory storage is not configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const steamId = body?.steam_id;
  if (!isValidSteamId(steamId)) return json({ error: 'Missing or invalid steam_id' }, 400);

  const existing = await env.INVENTORY_KV.get(`parked:${steamId}`, 'json');
  if (existing) {
    return json({ error: 'You already have a parked dino. Unpark it first.' }, 409);
  }

  const { status, data } = await fetchLiveDino(env, steamId);
  if (!data.found) {
    return json({ error: 'No live dino to park right now.' }, status === 200 ? 404 : status);
  }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    steamId,
    name: data.name || '',
    class: data.class || '',
    growth: typeof data.growth === 'number' ? data.growth : 0,
    health: typeof data.health === 'number' ? data.health : 0,
    stamina: typeof data.stamina === 'number' ? data.stamina : 0,
    hunger: typeof data.hunger === 'number' ? data.hunger : 0,
    thirst: typeof data.thirst === 'number' ? data.thirst : 0,
    parkedAt: Date.now(),
  };

  await env.INVENTORY_KV.put(`parked:${steamId}`, JSON.stringify(entry));
  return json({ parked: entry });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const steamId = new URL(request.url).searchParams.get('steam_id');
  if (!isValidSteamId(steamId)) return json({ error: 'Missing or invalid steam_id' }, 400);
  if (!env.INVENTORY_KV) return json({ error: 'Inventory storage is not configured' }, 503);

  await env.INVENTORY_KV.delete(`parked:${steamId}`);
  return json({ ok: true });
}
