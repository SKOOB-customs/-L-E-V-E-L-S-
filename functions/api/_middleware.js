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
 * Doesn't reject anything itself: plenty of routes here are meant to work
 * signed out (server-status, mutations-catalog, staff-roster, etc.), so
 * context.data.authedSteamId is just null for those and they never look
 * at it. Routes that require a caller identity (or an unlocked Admin
 * Panel) check it themselves and reject if it's null/false.
 */

import { verifySession, verifyAdminUnlock } from '../_lib/session.js';

export async function onRequest(context) {
  context.data.authedSteamId = await verifySession(context.env, context.request);
  const adminUnlock = await verifyAdminUnlock(context.env, context.request);
  context.data.adminUnlocked = !!adminUnlock;
  context.data.adminUnlockExpiresAt = adminUnlock?.expiresAt ?? null;
  return context.next();
}
