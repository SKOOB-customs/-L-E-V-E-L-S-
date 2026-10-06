/**
 * Desktop Overlay pairing, step 1: generates a short-lived, one-time
 * pairing code for the signed-in player, shown on the Profile tab. The
 * overlay app (a separate Electron process, no browser session of its
 * own) exchanges this code for a long-lived overlay token via
 * overlay-pair-exchange.js — same two-step shape most companion/TV/CLI
 * apps use for exactly this reason (avoids embedding Steam login inside
 * Electron's own Chromium view, which identity providers increasingly
 * block — see the overlay design memo for why).
 *
 * GET -> { code, expiresInSeconds }. steamId comes from the verified
 * session, never a client-supplied field.
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// Same character set as the Worker's own generateReferenceCode (comp/skin
// codes) — excludes visually-ambiguous characters (0/O, 1/I/L) since this
// gets hand-typed into a separate app, not pasted.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_TTL_SECONDS = 600; // 10 minutes

const generateCode = () => {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
};

export async function onRequestGet({ env, data }) {
  if (!env.PARKED_KV) return json({ error: 'Pairing storage is not configured' }, 503);

  const steamId = data.authedSteamId;
  if (!steamId) return json({ error: 'Please sign in with Steam again.' }, 401);

  try {
    const code = generateCode();
    // Cloudflare KV's own per-key TTL handles cleanup — no separate
    // expiry check or sweep needed, the key just stops existing.
    await env.PARKED_KV.put(`overlay_pairing:${code}`, JSON.stringify({ steamId, createdAt: Date.now() }), {
      expirationTtl: CODE_TTL_SECONDS,
    });
    return json({ code, expiresInSeconds: CODE_TTL_SECONDS });
  } catch (error) {
    return json({ error: error.message || 'Could not generate a pairing code right now.' }, 502);
  }
}
