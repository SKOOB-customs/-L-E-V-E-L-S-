/**
 * Proximity Voice (Phase 0): every spawned player's live location, from
 * one RCON sweep (the bridge Worker's /all-positions route — see its own
 * comment; the same RCON command Live Dino already polls happens to
 * return everyone, not just one player). Used client-side to compute
 * distance to other voice participants for volume falloff.
 *
 * GET -> { ok, players: { steamId: { location, class, name } } }. Any
 * signed-in player, not admin-gated — this is the same "who's where"
 * visibility the in-game player list already shows, not new exposure.
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const workerOrigin = (env) => {
  if (!env.SERVER_STATUS_URL) return null;
  try {
    return new URL(env.SERVER_STATUS_URL).origin;
  } catch {
    return null;
  }
};

export async function onRequestGet(context) {
  const { env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  if (!data.authedSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  try {
    const response = await fetch(`${origin}/all-positions`, {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Position sweep failed' }, 502);
  }
}
