/**
 * Runs before every functions/api/* handler (Cloudflare Pages' built-in
 * per-directory middleware). Verifies the levels_session cookie once,
 * here, and stashes the result on context.data.authedSteamId for every
 * route to read — rather than each of the ~25 routes that need to know
 * "who is really calling this" re-implementing that check individually.
 * Also verifies the separate levels_admin_unlock cookie (the Admin
 * Panel passkey feature) into context.data.adminUnlocked (boolean) and
 * context.data.adminUnlockExpiresAt (ms timestamp, or null), same
 * reasoning.
 *
 * A site ban (functions/api/chat-ban.js, player_ban:<steamId> in KV) is
 * enforced right here too, centrally, rather than in every individual
 * route: a banned steamId's session is treated as if it never existed at
 * all (authedSteamId forced back to null), which automatically makes
 * every route that already requires a real caller — nearly everything,
 * per the earlier session-hardening pass — reject them with no
 * per-route changes needed. context.data.banned is also exposed so
 * functions/api/session-status.js can tell the client WHY they were
 * logged out, rather than the generic "please sign in again."
 *
 * Doesn't reject anything itself: plenty of routes here are meant to work
 * signed out (server-status, mutations-catalog, staff-roster, etc.), so
 * context.data.authedSteamId is just null for those and they never look
 * at it. Routes that require a caller identity (or an unlocked Admin
 * Panel) check it themselves and reject if it's null/false.
 */

import { verifySession, verifyAdminUnlock } from '../_lib/session.js';

export async function onRequest(context) {
  const { env, request } = context;
  let steamId = await verifySession(env, request);

  context.data.banned = false;
  if (steamId && env.PARKED_KV) {
    try {
      const banned = await env.PARKED_KV.get(`player_ban:${steamId}`);
      if (banned) {
        context.data.banned = true;
        steamId = null;
      }
    } catch {
      // best-effort — a KV hiccup here shouldn't lock out every legitimate request
    }
  }
  context.data.authedSteamId = steamId;

  const adminUnlock = await verifyAdminUnlock(env, request);
  context.data.adminUnlocked = !!adminUnlock;
  context.data.adminUnlockExpiresAt = adminUnlock?.expiresAt ?? null;
  return context.next();
}
