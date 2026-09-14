/**
 * Whether the caller has a currently-valid session cookie. Used once per
 * page load to detect a stale "logged in" localStorage profile left over
 * from before session cookies existed (or one that's simply expired) and
 * force a clean client-side logout instead of leaving every action
 * failing with a confusing "please sign in again" error.
 *
 * Also reports banned: true when the reason authed is false is
 * specifically an active site ban (see functions/api/_middleware.js and
 * chat-ban.js) — the client shows a distinct "you've been banned"
 * message instead of the generic sign-in-again one when this fires mid-
 * session, not just at login.
 *
 * GET -> { authed: boolean, banned: boolean }
 */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestGet({ data }) {
  return json({ authed: !!data.authedSteamId, banned: !!data.banned });
}
