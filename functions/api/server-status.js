/**
 * Server Status API
 * 
 * Polls your game server for live status data.
 * Returns: { uptime: number, active_mods: number, players_online: number }
 * 
 * To configure:
 * 1. Set your game server's API endpoint in Cloudflare Pages secrets as SERVER_STATUS_URL
 * 2. Configure the server ID mapping in this function
 * 
 * Example response format expected from your game server:
 * {
 *   "uptime": 99.9,
 *   "active_mods": 18,
 *   "players_online": 5,
 *   "max_players": 10
 * }
 */

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const serverId = url.searchParams.get('server_id');

    if (!serverId) {
      return new Response(
        JSON.stringify({ error: 'Missing server_id parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const serverUrl = env.SERVER_STATUS_URL;

    if (serverId !== 'levels-main' || !serverUrl) {
      return new Response(
        JSON.stringify({
          uptime: null,
          active_mods: 0,
          players_online: 0,
          error: 'Server ID not configured',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch live status from game server with 5-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const headers = { Accept: 'application/json' };
    if (env.STATUS_API_TOKEN) headers.Authorization = `Bearer ${env.STATUS_API_TOKEN}`;
    const response = await fetch(serverUrl, {
      method: 'GET',
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeout);

    // Read upstream body as text so we can provide debug info if it's not JSON
    const upstreamContentType = response.headers.get('content-type') || '';
    const upstreamBody = await response.text();

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          uptime: null,
          active_mods: 0,
          players_online: 0,
          error: `Server responded with ${response.status}`,
          upstream_status: response.status,
          upstream_content_type: upstreamContentType,
          upstream_preview: upstreamBody ? upstreamBody.slice(0, 300) : null,
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let serverData;
    try {
      serverData = JSON.parse(upstreamBody || '{}');
    } catch (err) {
      // Attempt fallback to the RCON Worker endpoint if configured
      const origin = url.origin;
      if (env.STATUS_API_TOKEN) {
        try {
          const workerRes = await fetch(`${origin}/server-status`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${env.STATUS_API_TOKEN}`, Accept: 'application/json' },
          });
          const workerText = await workerRes.text();
          try {
            const workerData = JSON.parse(workerText || '{}');
            return new Response(
              JSON.stringify({
                uptime: typeof workerData.uptime === 'number' ? workerData.uptime : null,
                active_mods: typeof workerData.active_mods === 'number' ? workerData.active_mods : 0,
                players_online: typeof workerData.players_online === 'number' ? workerData.players_online : 0,
                max_players: typeof workerData.max_players === 'number' ? workerData.max_players : 0,
                source: 'rcon-worker',
              }),
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-store, max-age=0',
                  'Access-Control-Allow-Origin': '*',
                },
              }
            );
          } catch (e) {
            return new Response(
              JSON.stringify({
                uptime: null,
                active_mods: 0,
                players_online: 0,
                error: 'Upstream did not return valid JSON',
                upstream_status: response.status,
                upstream_content_type: upstreamContentType,
                upstream_preview: upstreamBody ? upstreamBody.slice(0, 300) : null,
                worker_status: workerRes.status,
                worker_preview: workerText ? workerText.slice(0, 300) : null,
              }),
              { status: 502, headers: { 'Content-Type': 'application/json' } }
            );
          }
        } catch (workerErr) {
          return new Response(
            JSON.stringify({
              uptime: null,
              active_mods: 0,
              players_online: 0,
              error: 'Upstream did not return valid JSON',
              upstream_status: response.status,
              upstream_content_type: upstreamContentType,
              upstream_preview: upstreamBody ? upstreamBody.slice(0, 300) : null,
              worker_error: String(workerErr).slice(0, 300),
            }),
            { status: 502, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({
          uptime: null,
          active_mods: 0,
          players_online: 0,
          error: 'Upstream did not return valid JSON',
          upstream_status: response.status,
          upstream_content_type: upstreamContentType,
          upstream_preview: upstreamBody ? upstreamBody.slice(0, 300) : null,
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Return normalized response
    return new Response(
      JSON.stringify({
        uptime: typeof serverData.uptime === 'number' ? serverData.uptime : null,
        active_mods: typeof serverData.active_mods === 'number' ? serverData.active_mods : 0,
        players_online: typeof serverData.players_online === 'number' ? serverData.players_online : 0,
        max_players: typeof serverData.max_players === 'number' ? serverData.max_players : 0,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    if (error.name === 'AbortError') {
      return new Response(
        JSON.stringify({
          uptime: null,
          active_mods: 0,
          players_online: 0,
          error: 'Server status request timed out',
        }),
        { status: 504, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        uptime: null,
        active_mods: 0,
        players_online: 0,
        error: error.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
