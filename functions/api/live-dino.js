/**
 * Live Dino API
 *
 * Looks up the caller's currently-spawned dinosaur via the RCON bridge Worker.
 * Returns: { found: true, name, playerId, class, location, growth, health,
 *            stamina, hunger, thirst, primeElder } or { found: false }.
 */

import { fetchLiveDino } from '../_lib/fetchLiveDino.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const steamId = url.searchParams.get('steam_id');

  if (!steamId || !/^\d{17}$/.test(steamId)) {
    return new Response(
      JSON.stringify({ found: false, error: 'Missing or invalid steam_id parameter' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { status, data } = await fetchLiveDino(env, steamId);

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
