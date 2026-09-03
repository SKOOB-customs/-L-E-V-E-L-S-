import { connect } from 'cloudflare:sockets';

const encoder = new TextEncoder();
const decoder = new TextDecoder('latin1');
const PLAYER_COMMAND = 0x40;
const AUTH_COMMAND = 0x01;
const COMMAND_PREFIX = 0x02;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const readUntil = async (reader, done, timeoutMs = 4500) => {
  let output = new Uint8Array();
  let timer;
  try {
    while (true) {
      const result = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('RCON response timed out')), timeoutMs);
        }),
      ]);
      clearTimeout(timer);
      if (result.done) break;
      const next = new Uint8Array(output.length + result.value.length);
      next.set(output);
      next.set(result.value, output.length);
      output = next;
      if (done(decoder.decode(output))) break;
    }
  } finally {
    clearTimeout(timer);
  }
  return decoder.decode(output);
};

const packet = (prefix, command, value = '') => {
  const payload = encoder.encode(value);
  const hasCommand = command !== null;
  const bytes = new Uint8Array((hasCommand ? 3 : 2) + payload.length);
  bytes[0] = prefix;
  if (hasCommand) bytes[1] = command;
  bytes.set(payload, hasCommand ? 2 : 1);
  bytes[bytes.length - 1] = 0;
  return bytes;
};

const parsePlayers = (response) => {
  const lines = response.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => line.toLowerCase() === 'playerlist');
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  return (lines[start] || '').split(',').map((value) => value.trim()).filter(Boolean).length;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/status') return json({ error: 'Not found' }, 404);
    if (env.STATUS_API_TOKEN && request.headers.get('Authorization') !== `Bearer ${env.STATUS_API_TOKEN}`) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (!env.RCON_HOST || !env.RCON_PORT || !env.RCON_PASSWORD) {
      return json({ error: 'RCON secrets are not configured' }, 503);
    }

    let socket;
    try {
      socket = connect({ hostname: env.RCON_HOST, port: Number(env.RCON_PORT) });
      const writer = socket.writable.getWriter();
      const reader = socket.readable.getReader();
      await writer.write(packet(AUTH_COMMAND, null, env.RCON_PASSWORD));
      const authResponse = await readUntil(reader, (value) => value.includes('Password Accepted'));
      if (!authResponse.includes('Password Accepted')) return json({ error: 'RCON authentication failed' }, 502);
      await writer.write(packet(COMMAND_PREFIX, PLAYER_COMMAND));
      const response = await readUntil(reader, (value) => value.includes('PlayerDataEnd') || value.includes('PlayerList'));
      const players = parsePlayers(response);
      await writer.close();
      reader.releaseLock();
      return json({ uptime: null, active_mods: 0, players_online: players, max_players: 0 });
    } catch (error) {
      try { socket?.close(); } catch { }
      return json({ error: error.message || 'RCON request failed' }, 502);
    }
  },
};