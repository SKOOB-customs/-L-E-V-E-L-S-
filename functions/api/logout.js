/**
 * Clears both the site session cookie and the Admin Panel unlock cookie
 * (if any) — the only two HttpOnly cookies this site sets, so they can't
 * be cleared from client-side JS directly. localStorage's profile/
 * discordProfile are cleared by the caller (script.js) after this
 * succeeds, since those aren't accessible here.
 *
 * POST -> {ok:true}
 */

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
});

// Max-Age=0 tells the browser to delete the cookie immediately. Same
// Path/SameSite/Secure attributes as when each was set — browsers only
// match a clearing Set-Cookie to the original by name+path+domain, not
// by attributes, but keeping them identical avoids any doubt.
const EXPIRE_SESSION = 'levels_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
const EXPIRE_ADMIN_UNLOCK = 'levels_admin_unlock=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

export async function onRequestPost() {
  const headers = new Headers();
  headers.append('Set-Cookie', EXPIRE_SESSION);
  headers.append('Set-Cookie', EXPIRE_ADMIN_UNLOCK);
  return json({ ok: true }, 200, headers);
}
