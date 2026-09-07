import { connect } from 'cloudflare:sockets';

const encoder = new TextEncoder();
const decoder = new TextDecoder('latin1');

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const readBytes = async (reader, count, timeoutMs = 4500) => {
  let buffer = new Uint8Array();
  let timer;
  try {
    while (buffer.length < count) {
      const result = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('RCON read timed out')), timeoutMs);
        }),
      ]);
      clearTimeout(timer);
      if (result.done) break;
      const next = new Uint8Array(buffer.length + result.value.length);
      next.set(buffer);
      next.set(result.value, buffer.length);
      buffer = next;
    }
  } finally {
    clearTimeout(timer);
  }
  return buffer.slice(0, count);
};

const rconPacket = (id, type, payload = '') => {
  const payloadBytes = encoder.encode(payload);
  const packet = new Uint8Array(4 + 4 + 4 + payloadBytes.length + 2);
  const view = new DataView(packet.buffer);
  view.setUint32(0, packet.length - 4, true);
  view.setUint32(4, id, true);
  view.setUint32(8, type, true);
  packet.set(payloadBytes, 12);
  packet[packet.length - 2] = 0;
  packet[packet.length - 1] = 0;
  return packet;
};

const parsePlayers = (response) => {
  const lines = response.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const playerListIdx = lines.findIndex((line) => line.toLowerCase().includes('playerlist'));
  if (playerListIdx < 0) return 0;
  const dataLine = lines[playerListIdx + 1] || '';
  return dataLine.split(',').map((v) => v.trim()).filter(Boolean).length;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/status' && url.pathname !== '/server-status') return json({ error: 'Not found' }, 404);

    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (env.STATUS_API_TOKEN && token !== env.STATUS_API_TOKEN) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (!env.RCON_HOST || !env.RCON_PORT || !env.RCON_PASSWORD) {
      return json({
        error: 'RCON secrets are not configured',
        missing: {
          RCON_HOST: !env.RCON_HOST,
          RCON_PORT: !env.RCON_PORT,
          RCON_PASSWORD: !env.RCON_PASSWORD,
        },
      }, 503);
    }

    let socket;
    let stage = 'connect';
    try {
      socket = connect({ hostname: env.RCON_HOST, port: Number(env.RCON_PORT) });
      const writer = socket.writable.getWriter();
      const reader = socket.readable.getReader();

      stage = 'send authentication';
      await writer.write(rconPacket(0, 3, env.RCON_PASSWORD));

      stage = 'read authentication response';
      const authHeader = await readBytes(reader, 4);
      const authSize = new DataView(authHeader.buffer).getUint32(0, true);
      const authBody = await readBytes(reader, authSize);
      const authResponse = decoder.decode(authBody);
      if (!authResponse.includes('Password Accepted') && !authResponse.includes('authenticated')) {
        await writer.close();
        reader.releaseLock();
        return json({ error: 'RCON authentication failed: ' + authResponse }, 502);
      }

      stage = 'player command';
      await writer.write(rconPacket(1, 2, 'PlayerList'));

      stage = 'read player response';
      const respHeader = await readBytes(reader, 4);
      const respSize = new DataView(respHeader.buffer).getUint32(0, true);
      const respBody = await readBytes(reader, respSize);
      const response = decoder.decode(respBody);
      const players = parsePlayers(response);

      await writer.close();
      reader.releaseLock();
      return json({ uptime: null, active_mods: 0, players_online: players, max_players: 0 });
    } catch (error) {
      try { socket?.close(); } catch { }
      return json({ error: error.message || 'RCON request failed', stage }, 502);
    }
  },
};
