import { connect } from 'cloudflare:sockets';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

// Evrima's RCON is a custom protocol, not Source RCON: 0x01 + password + \0 for auth,
// 0x02 + opcode byte + payload + \0 for commands. No length-prefixed framing.
const RCON_AUTH = 0x01;
const RCON_EXECCOMMAND = 0x02;
const PLAYERLIST_OPCODE = 0x40;
const PLAYER_DATA_OPCODE = 0x77;

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

const authPacket = (password) => {
  const payload = encoder.encode(password);
  const bytes = new Uint8Array(1 + payload.length + 1);
  bytes[0] = RCON_AUTH;
  bytes.set(payload, 1);
  bytes[bytes.length - 1] = 0;
  return bytes;
};

const commandPacket = (opcode, value = '') => {
  const payload = encoder.encode(value);
  const bytes = new Uint8Array(2 + payload.length + 1);
  bytes[0] = RCON_EXECCOMMAND;
  bytes[1] = opcode;
  bytes.set(payload, 2);
  bytes[bytes.length - 1] = 0;
  return bytes;
};

const parsePlayers = (response) => {
  const lines = response.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => line.toLowerCase() === 'playerlist');
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  return (lines[start] || '').split(',').map((value) => value.trim()).filter(Boolean).length;
};

// GetPlayerData emits one line per spawned player: comma-separated "Key: value" pairs,
// e.g. "Name: Kasia, PlayerID: 765..., Location: X=1 Y=2 Z=3, Class: Stegosaurus,
// Growth: 0.85, Health: 1.0, Stamina: 1.0, Hunger: 0.19, Thirst: 0.84, PrimeElder: false, ..."
// bracketed mutation-slot fields also appear but aren't needed here.
const parseLocation = (value) => {
  const location = { x: 0, y: 0, z: 0 };
  (value || '').split(' ').forEach((part) => {
    const [axis, raw] = part.split('=');
    const num = Number.parseFloat(raw);
    if (axis === 'X') location.x = num;
    if (axis === 'Y') location.y = num;
    if (axis === 'Z') location.z = num;
  });
  return location;
};

const parsePlayerDataLine = (line) => {
  const fields = {};
  line.split(',').forEach((chunk) => {
    const separator = chunk.indexOf(': ');
    if (separator < 0) return;
    fields[chunk.slice(0, separator).trim()] = chunk.slice(separator + 2).trim();
  });
  if (!fields.PlayerID) return null;
  return {
    name: fields.Name || '',
    playerId: fields.PlayerID,
    class: fields.Class || '',
    location: parseLocation(fields.Location),
    growth: Number.parseFloat(fields.Growth) || 0,
    health: Number.parseFloat(fields.Health) || 0,
    stamina: Number.parseFloat(fields.Stamina) || 0,
    hunger: Number.parseFloat(fields.Hunger) || 0,
    thirst: Number.parseFloat(fields.Thirst) || 0,
    primeElder: (fields.PrimeElder || '').toLowerCase() === 'true',
  };
};

const findPlayerDino = (response, steamId) => {
  const lines = response.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (!line.includes('PlayerID')) continue;
    const dino = parsePlayerDataLine(line);
    if (dino && dino.playerId === steamId) return dino;
  }
  return null;
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
      await writer.write(authPacket(env.RCON_PASSWORD));

      stage = 'read authentication response';
      const authResponse = await readUntil(reader, (value) => value.includes('Password Accepted'));
      if (!authResponse.includes('Password Accepted')) {
        await writer.close();
        reader.releaseLock();
        return json({ error: 'RCON authentication failed: ' + authResponse }, 502);
      }

      const steamId = url.searchParams.get('steam_id');

      if (steamId) {
        stage = 'player data command';
        await writer.write(commandPacket(PLAYER_DATA_OPCODE));

        stage = 'read player data response';
        const response = await readUntil(reader, (value) => value.includes('PlayerDataEnd'));
        await writer.close();
        reader.releaseLock();

        const dino = findPlayerDino(response, steamId);
        if (!dino) return json({ found: false }, 404);
        return json({ found: true, ...dino });
      }

      stage = 'player command';
      await writer.write(commandPacket(PLAYERLIST_OPCODE));

      stage = 'read player response';
      const response = await readUntil(reader, (value) => value.includes('PlayerDataEnd') || value.includes('PlayerList'));
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
