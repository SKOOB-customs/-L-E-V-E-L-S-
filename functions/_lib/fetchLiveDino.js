/**
 * Shared helper: looks up a player's currently-spawned dino via the RCON bridge Worker.
 * Returns the parsed JSON body plus the upstream HTTP status, or throws on network failure.
 */
export async function fetchLiveDino(env, steamId) {
  const baseUrl = env.SERVER_STATUS_URL;
  if (!baseUrl) {
    return { status: 503, data: { found: false, error: 'Server status not configured' } };
  }

  const target = new URL(baseUrl);
  target.searchParams.set('steam_id', steamId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(target.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(env.STATUS_API_TOKEN ? { Authorization: `Bearer ${env.STATUS_API_TOKEN}` } : {}),
      },
    });
    clearTimeout(timeout);

    const bodyText = await response.text();
    let data;
    try {
      data = JSON.parse(bodyText || '{}');
    } catch {
      return { status: 502, data: { found: false, error: 'Upstream did not return valid JSON' } };
    }
    return { status: response.status, data };
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      return { status: 504, data: { found: false, error: 'Live dino request timed out' } };
    }
    return { status: 500, data: { found: false, error: error.message } };
  }
}
