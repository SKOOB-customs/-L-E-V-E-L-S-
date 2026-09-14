/**
 * Clears both the site session cookie and the Admin Panel unlock cookie
 * (if any) — the only two HttpOnly cookies this site sets, so they can't
 * be cleared from client-side JS directly. localStorage's profile/
 * discordProfile are cleared by the caller (script.js) after this
 * succeeds, since those aren't accessible here.
 *
 * POST -> {ok:true}
 */

// Max-Age=0 tells the browser to delete the cookie immediately. Same
// Path/SameSite/Secure attributes as when each was set — browsers only
// match a clearing Set-Cookie to the original by name+path+domain, not
// by attributes, but keeping them identical avoids any doubt.
const EXPIRE_SESSION = 'levels_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
const EXPIRE_ADMIN_UNLOCK = 'levels_admin_unlock=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

export async function onRequestPost() {
  // Built directly with a real Headers object rather than the usual
  // json(body, status, headers) helper other routes use — that helper
  // spreads its third argument into a plain object literal (`{...headers}`),
  // which silently drops everything when handed an actual Headers
  // instance (its entries live in internal slots, not own enumerable
  // properties, so the spread copies nothing). Confirmed live: neither
  // Set-Cookie ever reached the browser, so logging out never actually
  // cleared the Admin Panel unlock — it survived a full Steam+Discord
  // logout and re-login since the cookie itself was still valid and
  // still tied to the same steamId.
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', EXPIRE_SESSION);
  headers.append('Set-Cookie', EXPIRE_ADMIN_UNLOCK);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
