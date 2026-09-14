/**
 * Runs before every functions/api/* handler (Cloudflare Pages' built-in
 * per-directory middleware). Verifies the levels_session cookie once,
 * here, and stashes the result on context.data.authedSteamId for every
 * route to read — rather than each of the ~25 routes that need to know
 * "who is really calling this" re-implementing that check individually.
 *
 * Doesn't reject anything itself: plenty of routes here are meant to work
 * signed out (server-status, mutations-catalog, staff-roster, etc.), so
 * context.data.authedSteamId is just null for those and they never look
 * at it. Routes that require a caller identity check it themselves and
 * 401 if it's null.
 */

import { verifySession } from '../_lib/session.js';

export async function onRequest(context) {
  context.data.authedSteamId = await verifySession(context.env, context.request);
  return context.next();
}
