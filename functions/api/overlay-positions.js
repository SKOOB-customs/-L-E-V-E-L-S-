/**
 * Desktop Overlay's Map widget: every spawned player's live location,
 * same data as all-positions.js, but authenticated via the overlay's own
 * long-lived token (see functions/_lib/session.js's signOverlayToken)
 * instead of a session cookie — the overlay app has no browser session
 * to carry one. CORS-open since the overlay runs from a separate Electron
 * origin, not the site itself.
 *
 * GET ?token= -> proxied to the bridge Worker's /all-positions route,
 * same as all-positions.js.
 */

import { verifyOverlayToken } from '../_lib/session.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  },
});

const workerOrigin = (env) => {
  if (!env.SERVER_STATUS_URL) return null;
  try {
    return new URL(env.SERVER_STATUS_URL).origin;
  } catch {
    return null;
  }
};

export async function onRequestGet({ request, env }) {
  const origin = workerOrigin(env);
  if (!origin) return json({ error: 'Bridge is not configured' }, 503);

  const token = new URL(request.url).searchParams.get('token');
  const verified = token ? await verifyOverlayToken(env, token) : null;
  if (!verified) return json({ error: 'Invalid or expired overlay token — re-pair from the website.' }, 401);

  try {
    const response = await fetch(`${origin}/all-positions`, {
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    const result = await response.json();
    return json(result, response.status);
  } catch (error) {
    return json({ error: error.message || 'Position sweep failed' }, 502);
  }
}
