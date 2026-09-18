/**
 * Owner tab's Moderation Log: every admin action taken through the
 * website — chat message deletion/timeout/ban, compensation/transfer/
 * recovery grants. Distinct from the in-game admin_audit system (see
 * bridge-worker.js's own comment on that), which covers console commands
 * run in-game, not the website.
 *
 * GET (no params) -> { entries: [{at, action, actorSteamId,
 * targetSteamId, detail}] }, proxied to the bridge Worker's
 * /moderation-log route, which re-verifies the caller is actually an
 * OWNER (not just any admin tier) before returning anything.
 * requesterSteamId comes from the verified session, never a
 * client-supplied field.
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

  const requesterSteamId = data.authedSteamId;
  if (!requesterSteamId) return json({ error: 'Please sign in with Steam again.' }, 401);
  if (!data.adminUnlocked) return json({ error: 'Enter your admin passkey to use the Admin Panel.' }, 403);

  try {
    const target = new URL(`${origin}/moderation-log`);
    target.searchParams.set('requesterSteamId', requesterSteamId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Moderation log lookup failed' }, 502);
  }
}
