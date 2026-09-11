/**
 * Inventory: reassign which mutation occupies one of the caller's own
 * parked dino's already-filled mutation slots (empty slots are locked —
 * see the bridge Worker's /edit-parked-mutation route for why).
 *
 * POST { steamId, requesterSteamId, snapshotId, field, mutationName } ->
 * proxied to the bridge Worker's /edit-parked-mutation route, which
 * re-validates requesterSteamId === steamId, that the slot is currently
 * filled, and that the mutation is diet-appropriate for that dino's
 * species, server-side before touching the file.
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

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    const response = await fetch(`${origin}/edit-parked-mutation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Mutation edit failed' }, 502);
  }
}
