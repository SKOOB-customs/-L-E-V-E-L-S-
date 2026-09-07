/**
 * Live Dino API
 *
 * Looks up the caller's currently-spawned dinosaur via the RCON bridge Worker.
 * Returns: { found: true, name, playerId, class, location, growth, health,
 *            stamina, hunger, thirst, primeElder } or { found: false }.
 */

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steam_id');

    if (!steamId || !/^\d{17}$/.test(steamId)) {
      return new Response(
        JSON.stringify({ found: false, error: 'Missing or invalid steam_id parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = env.SERVER_STATUS_URL;
    if (!baseUrl) {
      return new Response(
        JSON.stringify({ found: false, error: 'Server status not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const target = new URL(baseUrl);
    target.searchParams.set('steam_id', steamId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const headers = { Accept: 'application/json' };
    if (env.STATUS_API_TOKEN) headers.Authorization = `Bearer ${env.STATUS_API_TOKEN}`;

    const response = await fetch(target.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeout);

    const bodyText = await response.text();
    let data;
    try {
      data = JSON.parse(bodyText || '{}');
    } catch {
      return new Response(
        JSON.stringify({ found: false, error: 'Upstream did not return valid JSON' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      return new Response(
        JSON.stringify({ found: false, error: 'Live dino request timed out' }),
        { status: 504, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ found: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
