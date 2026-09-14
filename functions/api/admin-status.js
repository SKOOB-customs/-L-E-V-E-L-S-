/**
 * Admin-tier lookup for the website's Admin Panel tab.
 *
 * GET -> { tier: "owner"|"senior"|"admin"|null, hasPasskey: boolean,
 * unlocked: boolean, unlockExpiresAt: number|null } for the caller's
 * verified session steamId, tier
 * proxied to the bridge Worker's /admin-tier route (same cross-service
 * indirection every other functions/api/*.js file uses — see park.js for
 * the full rationale). Purely a UI-reveal check; the actual write routes
 * (compensation, strikes, etc.) re-validate tier AND adminUnlocked
 * server-side regardless of what this says — but this now checks the
 * REAL caller too, not a client-supplied steam_id, since nothing stopped
 * someone from asking "what's this OTHER steamId's admin tier" before.
 *
 * hasPasskey/unlocked drive the Admin Panel passkey gate: no passkey set
 * yet -> the client shows "set one"; a passkey exists but the caller
 * isn't in the request's context.data.adminUnlocked window -> "enter it";
 * unlocked -> show the real panel. This route deliberately does NOT
 * require adminUnlocked itself (it's the read that tells the client
 * whether to show that prompt at all).
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

export async function onRequestGet(context) {
  const { env, data } = context;
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const steamId = data.authedSteamId;
  if (!isValidSteamId(steamId)) return json({ tier: null });

  try {
    const target = new URL(`${origin}/admin-tier`);
    target.searchParams.set('steamId', steamId);
    const response = await fetch(target.toString(), {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const tierData = await response.json();
    if (!response.ok || !tierData.tier) return json(tierData, response.status);

    let hasPasskey = false;
    if (env.PARKED_KV) {
      try {
        const record = await env.PARKED_KV.get(`admin_passkey:${steamId}`, 'json');
        hasPasskey = !!record;
      } catch {
        // best-effort — worst case the client is asked to "set" a passkey
        // that already exists, which just re-prompts rather than exposing anything
      }
    }
    console.log('admin-status debug:', JSON.stringify({ steamId, adminUnlocked: data.adminUnlocked, adminUnlockExpiresAt: data.adminUnlockExpiresAt, hasCookieHeader: !!context.request.headers.get('Cookie') }));
    return json({ ...tierData, hasPasskey, unlocked: !!data.adminUnlocked, unlockExpiresAt: data.adminUnlockExpiresAt });
  } catch (error) {
    return json({ error: error.message || 'Admin tier lookup failed' }, 502);
  }
}
