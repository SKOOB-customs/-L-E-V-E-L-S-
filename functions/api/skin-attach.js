/**
 * Inventory: attach one skin charge to ONE specific parked dino. Pure file
 * read-modify-write on the Worker (no live pawn needed) — the skin bakes
 * into that snapshot and applies once, at redeem time.
 *
 * POST { steamId, snapshotId, skinCode } -> proxied to the bridge Worker's
 * /skin-attach-parked route, which re-validates ownership server-side.
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

const isValidSteamId = (id) => typeof id === 'string' && /^\d{17}$/.test(id);

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

  const { steamId, snapshotId, skinCode } = body || {};
  if (!isValidSteamId(steamId)) return json({ error: 'Missing or invalid steamId' }, 400);
  if (typeof snapshotId !== 'number') return json({ error: 'Missing or invalid snapshotId' }, 400);
  if (typeof skinCode !== 'string' || skinCode === '') return json({ error: 'Missing or invalid skinCode' }, 400);

  try {
    const response = await fetch(`${origin}/skin-attach-parked`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ steamId, requesterSteamId: steamId, snapshotId, skinCode }),
    });
    const data = await response.json();
    return json(data, response.status);
  } catch (error) {
    return json({ error: error.message || 'Skin attach failed' }, 502);
  }
}
