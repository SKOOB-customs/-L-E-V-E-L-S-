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

// ── Mod <-> website bridge ──
//
// The LevelsPark UE4SS mod (game-mods/LevelsPark) writes one JSON snapshot
// per player to Mods/LevelsPark/Saved/parked_<steamid>.json on the game
// server's local disk when a player types !park. The mod itself has no way
// to push that data anywhere — os.execute/curl doesn't work in this
// Wine-hosted environment (confirmed live: curl.exe isn't installed at all).
// Per the community's own reference architecture for this exact problem
// (file-based IPC — the mod only ever touches local files, an external
// process does the network calls), this Worker plays that external-process
// role via Bropanel's Pterodactyl-based Client API (plain HTTPS + API key),
// polling on a Cron Trigger. No extra hosting needed beyond this Worker.
const PARKED_SAVED_DIR = '/TheIsle/Binaries/Win64/ue4ss/Mods/LevelsPark/Saved';

const pterodactylFetch = async (env, path) => {
  const url = `${env.PTERODACTYL_BASE_URL}/api/client/servers/${env.PTERODACTYL_SERVER_ID}${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.PTERODACTYL_API_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Pterodactyl API ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response;
};

const listParkedFiles = async (env) => {
  const response = await pterodactylFetch(
    env,
    `/files/list?directory=${encodeURIComponent(PARKED_SAVED_DIR)}`,
  );
  const body = await response.json();
  return (body.data || [])
    .map((entry) => entry.attributes)
    .filter((attrs) => attrs?.is_file && /^parked_\d+\.json$/.test(attrs.name));
};

const readParkedFile = async (env, filename) => {
  const path = `${PARKED_SAVED_DIR}/${filename}`;
  const response = await pterodactylFetch(env, `/files/contents?file=${encodeURIComponent(path)}`);
  return response.text();
};

const pterodactylWriteFile = async (env, path, body) => {
  const url = `${env.PTERODACTYL_BASE_URL}/api/client/servers/${env.PTERODACTYL_SERVER_ID}/files/write?file=${encodeURIComponent(path)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PTERODACTYL_API_KEY}`,
      'Content-Type': 'text/plain',
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Pterodactyl write ${path} failed: ${response.status} ${await response.text()}`);
  }
};

// Each parked_<steamid>.json now holds {version:2, steam, dinos:[...]} — a
// player can have any number of parked dinos, not just one. Syncs every
// file currently on disk into KV as one flattened aggregated document, one
// entry per snapshot (not per player), keyed by `${steam}_${capturedAt}`
// (capturedAt doubles as a snapshot id — see main.lua). Deleting a snapshot
// (via !redeem or a website redeem) naturally drops it from the next sync
// since we rebuild the whole map each run rather than merging.
const syncParkedDinos = async (env) => {
  const files = await listParkedFiles(env);
  const parked = {};
  for (const file of files) {
    const raw = await readParkedFile(env, file.name);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue; // skip partially-written or corrupt files rather than failing the whole sync
    }
    if (!data?.steam || !Array.isArray(data.dinos)) continue;
    for (const dino of data.dinos) {
      if (!dino?.capturedAt) continue;
      parked[`${data.steam}_${dino.capturedAt}`] = { ...dino, steam: data.steam };
    }
  }
  await env.PARKED_KV.put('parked:index', JSON.stringify({ updatedAt: Date.now(), parked }));
  return parked;
};

// ── Admin-tier audit log sync ──
//
// main.lua's admin-action hooks (Ban/Kick/SetWeather/SetNewAvailableClasses
// on ATIGameModeBase) append a hash-chained line per event to
// admin_audit_log.ndjson on the game server. That local file alone is only
// tamper-EVIDENT (anyone with file access to the game server, i.e. any
// tier of admin via Bropanel, could in principle edit or delete lines and
// the hash chain would just show a break from that point on). The real
// tamper-RESISTANCE comes from pulling every new line off the game server
// entirely into this Worker's KV on the existing 1-minute sync cron — a
// system only the Cloudflare account owner controls, which no admin tier
// has any access to. Each entry becomes its own immutable KV key
// (admin_audit:entry:<seq>), never overwritten once written, and the hash
// chain is independently re-verified here rather than trusted at face
// value from the file.
const ADMIN_AUDIT_LOG_PATH = `${PARKED_SAVED_DIR}/admin_audit_log.ndjson`;

// Must exactly mirror main.lua's simpleHash — pure arithmetic (no bitwise
// ops) so both sides agree regardless of the Lua runtime's numeric type.
const simpleHash = (s) => {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash % 16777216) * 16777619 + s.charCodeAt(i)) % 4294967296;
  }
  return (hash % 4294967296).toString(16).padStart(8, '0');
};

const syncAdminAuditLog = async (env) => {
  let raw;
  try {
    const response = await pterodactylFetch(env, `/files/contents?file=${encodeURIComponent(ADMIN_AUDIT_LOG_PATH)}`);
    raw = await response.text();
  } catch {
    return { synced: 0 }; // no admin action has ever happened yet — nothing to sync
  }

  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const lastSeqRaw = await env.PARKED_KV.get('admin_audit:last_seq');
  let lastSeq = lastSeqRaw ? Number.parseInt(lastSeqRaw, 10) : 0;
  let chainHeadHash = (await env.PARKED_KV.get('admin_audit:chain_head_hash')) || 'genesis';

  let synced = 0;
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // skip a partially-written line rather than failing the whole sync
    }
    if (!entry || typeof entry.seq !== 'number' || entry.seq <= lastSeq) continue;

    // Recomputed independently, not trusted from the file — this is what
    // makes the chain verification meaningful rather than decorative.
    const bodyForHash = `${entry.seq}|${entry.ts}|${entry.action}|${entry.adminSteam}|${entry.adminTier}|${entry.allowed}|${entry.extra}`;
    const expectedHash = simpleHash(`${entry.prevHash}|${bodyForHash}`);
    const chainOk = entry.prevHash === chainHeadHash && expectedHash === entry.hash;

    await env.PARKED_KV.put(
      `admin_audit:entry:${entry.seq}`,
      JSON.stringify({ ...entry, chainVerified: chainOk, syncedAt: Date.now() }),
    );
    if (!chainOk) {
      await env.PARKED_KV.put(
        `admin_audit:tamper_alert:${Date.now()}_seq${entry.seq}`,
        JSON.stringify({
          atSeq: entry.seq,
          expectedPrevHash: chainHeadHash,
          actualPrevHash: entry.prevHash,
          expectedHash,
          actualHash: entry.hash,
          detectedAt: Date.now(),
        }),
      );
    }

    lastSeq = entry.seq;
    // Continue from the file's own hash even on a break, so the same break
    // isn't re-flagged as a fresh alert on every future sync.
    chainHeadHash = entry.hash;
    synced += 1;
  }

  if (synced > 0) {
    await env.PARKED_KV.put('admin_audit:last_seq', String(lastSeq));
    await env.PARKED_KV.put('admin_audit:chain_head_hash', chainHeadHash);
  }
  return { synced, lastSeq };
};

const REDEEM_SAVED_DIR = PARKED_SAVED_DIR;

const parkRequestPath = (steamId) => `${REDEEM_SAVED_DIR}/park_request_${steamId}.json`;
const parkResultPath = (steamId) => `${REDEEM_SAVED_DIR}/park_result_${steamId}.json`;
const redeemRequestPath = (steamId) => `${REDEEM_SAVED_DIR}/redeem_request_${steamId}.json`;
const redeemResultPath = (steamId) => `${REDEEM_SAVED_DIR}/redeem_result_${steamId}.json`;

// Writes a request file the mod's poll loop will pick up (see main.lua's
// gm.AllPlayerControllers-based poller — it can only discover this file
// while steamId is actually online, which is required anyway since
// applying stats needs a live pawn). Shared by both park and redeem.
const writeRequest = async (env, requestPath, steamId, payload) => {
  const requestId = crypto.randomUUID();
  const body = JSON.stringify({ ...payload, requestId, requestedAt: Date.now() });
  await pterodactylWriteFile(env, requestPath(steamId), body);
  return requestId;
};

// Reads back the mod's result file, if any. Returns null if nothing has
// been written yet or if it belongs to a different (older) request.
const readResult = async (env, resultPath, steamId, requestId) => {
  let raw;
  try {
    const response = await pterodactylFetch(env, `/files/contents?file=${encodeURIComponent(resultPath(steamId))}`);
    raw = await response.text();
  } catch {
    return null; // no result file yet
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data?.requestId !== requestId) return null; // stale result from an earlier request
  return data;
};

const requestPark = (env, steamId, name) => writeRequest(env, parkRequestPath, steamId, { name: name || '' });
const readParkResult = (env, steamId, requestId) => readResult(env, parkResultPath, steamId, requestId);
const requestRedeem = (env, steamId, snapshotId) => writeRequest(env, redeemRequestPath, steamId, { snapshotId });
const readRedeemResult = (env, steamId, requestId) => readResult(env, redeemResultPath, steamId, requestId);

// ── Website admin panel: admin-tier lookup, compensation, strikes ──
//
// admin_tiers.json (written directly via Pterodactyl when the roster was
// seeded — see main.lua's tierOf/canPerform, which reads the same file for
// the in-game audit log) had no website-facing reader until now. Synced
// into KV on the same 1-minute cron as the other two syncs, so tier checks
// here are a KV read, not a Pterodactyl round-trip per admin-panel action.
const ADMIN_TIERS_PATH = `${PARKED_SAVED_DIR}/admin_tiers.json`;

const syncAdminTiers = async (env) => {
  let raw;
  try {
    const response = await pterodactylFetch(env, `/files/contents?file=${encodeURIComponent(ADMIN_TIERS_PATH)}`);
    raw = await response.text();
  } catch {
    return { synced: false }; // roster file doesn't exist yet
  }
  let tiers;
  try {
    tiers = JSON.parse(raw);
  } catch {
    return { synced: false };
  }
  await env.PARKED_KV.put('admin_tiers:index', JSON.stringify({
    owner: Array.isArray(tiers.owner) ? tiers.owner : [],
    senior: Array.isArray(tiers.senior) ? tiers.senior : [],
    admin: Array.isArray(tiers.admin) ? tiers.admin : [],
    updatedAt: Date.now(),
  }));
  return { synced: true };
};

const getAdminTier = async (env, steamId) => {
  const raw = await env.PARKED_KV.get('admin_tiers:index');
  if (!raw) return null;
  let tiers;
  try {
    tiers = JSON.parse(raw);
  } catch {
    return null;
  }
  if (tiers.owner?.includes(steamId)) return 'owner';
  if (tiers.senior?.includes(steamId)) return 'senior';
  if (tiers.admin?.includes(steamId)) return 'admin';
  return null;
};

// Same 22-species roster as Game.ini's current AllowedClasses (see the
// admin-panel plan doc) — update by hand if that list changes. classPath
// shape confirmed against real LogTheIsleJoinData log lines this session.
const KNOWN_SPECIES = [
  'Allosaurus', 'Austroraptor', 'Beipiaosaurus', 'Carnotaurus', 'Ceratosaurus',
  'Deinosuchus', 'Diabloceratops', 'Dilophosaurus', 'Dryosaurus', 'Gallimimus',
  'Herrerasaurus', 'Hypsilophodon', 'Kentrosaurus', 'Maiasaura', 'Omniraptor',
  'Pachycephalosaurus', 'Pteranodon', 'Stegosaurus', 'Tenontosaurus',
  'Triceratops', 'Troodon', 'Tyrannosaurus',
];

const classPathForSpecies = (species) =>
  `/Game/TheIsle/Core/Characters/Dinosaurs/${species}/BP_${species}.BP_${species}_C`;

// Reused by both the compensation grant and (indirectly) syncParkedDinos'
// own file format — mirrors main.lua's writeParkedDinos envelope exactly,
// so !redeem / the website's Redeem button need zero changes to handle a
// compensation-granted dino.
const parkedFilePathFor = (steamId) => `${PARKED_SAVED_DIR}/parked_${steamId}.json`;

// Shared by compensation, rename, and release — every write to a player's
// parked_<steamid>.json goes through this same read-modify-write pair so
// the envelope shape (main.lua's writeParkedDinos format) stays consistent
// no matter which admin-panel or inventory action touched the file.
const readParkedDinosArray = async (env, steamId) => {
  try {
    const response = await pterodactylFetch(env, `/files/contents?file=${encodeURIComponent(parkedFilePathFor(steamId))}`);
    const raw = await response.text();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.dinos) ? parsed.dinos : [];
  } catch {
    return []; // no existing file for this player yet
  }
};

const writeParkedDinosArray = async (env, steamId, dinos) => {
  const body = JSON.stringify({ version: 2, steam: steamId, dinos });
  await pterodactylWriteFile(env, parkedFilePathFor(steamId), body);
};

const grantCompensationDino = async (env, targetSteamId, dino) => {
  const dinos = await readParkedDinosArray(env, targetSteamId);
  dinos.push(dino);
  await writeParkedDinosArray(env, targetSteamId, dinos);
};

const pctToFraction = (value) => Math.min(100, Math.max(0, Number(value) || 0)) / 100;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Manual trigger for testing the bridge without waiting for the cron
    // schedule — same bearer-token gate as the RCON routes below.
    if (url.pathname === '/sync-parked') {
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      if (env.STATUS_API_TOKEN && token !== env.STATUS_API_TOKEN) {
        return json({ error: 'Unauthorized' }, 401);
      }
      if (!env.PTERODACTYL_API_KEY || !env.PTERODACTYL_BASE_URL || !env.PTERODACTYL_SERVER_ID || !env.PARKED_KV) {
        return json({
          error: 'Pterodactyl bridge is not configured',
          missing: {
            PTERODACTYL_API_KEY: !env.PTERODACTYL_API_KEY,
            PTERODACTYL_BASE_URL: !env.PTERODACTYL_BASE_URL,
            PTERODACTYL_SERVER_ID: !env.PTERODACTYL_SERVER_ID,
            PARKED_KV: !env.PARKED_KV,
          },
        }, 503);
      }
      try {
        const parked = await syncParkedDinos(env);
        const audit = await syncAdminAuditLog(env).catch((error) => ({ error: error.message }));
        const tiers = await syncAdminTiers(env).catch((error) => ({ error: error.message }));
        return json({ ok: true, count: Object.keys(parked).length, parked, audit, tiers });
      } catch (error) {
        return json({ error: error.message || 'Sync failed' }, 502);
      }
    }

    // Website → mod write direction: a player clicked Park on the Live Dino
    // tab. Called by functions/api/park.js, not directly by the browser
    // (same indirection as the read-path bridge).
    if (url.pathname === '/park-request' && request.method === 'POST') {
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      if (env.STATUS_API_TOKEN && token !== env.STATUS_API_TOKEN) {
        return json({ error: 'Unauthorized' }, 401);
      }
      if (!env.PTERODACTYL_API_KEY || !env.PTERODACTYL_BASE_URL || !env.PTERODACTYL_SERVER_ID) {
        return json({ error: 'Pterodactyl bridge is not configured' }, 503);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { steamId, name } = body || {};
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (name !== undefined && typeof name !== 'string') {
        return json({ error: 'Invalid name' }, 400);
      }
      try {
        const requestId = await requestPark(env, steamId, name);
        return json({ ok: true, requestId });
      } catch (error) {
        return json({ error: error.message || 'Park request failed' }, 502);
      }
    }

    // Polled by the website after a park request to find out whether the
    // mod actually processed it (and whether it succeeded).
    if (url.pathname === '/park-result' && request.method === 'GET') {
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      if (env.STATUS_API_TOKEN && token !== env.STATUS_API_TOKEN) {
        return json({ error: 'Unauthorized' }, 401);
      }
      const steamId = url.searchParams.get('steamId');
      const requestId = url.searchParams.get('requestId');
      if (!steamId || !/^\d{17}$/.test(steamId) || !requestId) {
        return json({ error: 'Missing or invalid steamId/requestId' }, 400);
      }
      try {
        const result = await readParkResult(env, steamId, requestId);
        return json(result ? { ok: result.ok, message: result.message, processedAt: result.processedAt } : { ok: null });
      } catch (error) {
        return json({ error: error.message || 'Park result lookup failed' }, 502);
      }
    }

    // Website → mod write direction: a player clicked Redeem on a specific
    // parked-dino card. Called by functions/api/redeem.js, not directly by
    // the browser (same indirection as the read-path bridge).
    if (url.pathname === '/redeem-request' && request.method === 'POST') {
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      if (env.STATUS_API_TOKEN && token !== env.STATUS_API_TOKEN) {
        return json({ error: 'Unauthorized' }, 401);
      }
      if (!env.PTERODACTYL_API_KEY || !env.PTERODACTYL_BASE_URL || !env.PTERODACTYL_SERVER_ID) {
        return json({ error: 'Pterodactyl bridge is not configured' }, 503);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { steamId, snapshotId } = body || {};
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (typeof snapshotId !== 'number') {
        return json({ error: 'Missing or invalid snapshotId' }, 400);
      }
      try {
        const requestId = await requestRedeem(env, steamId, snapshotId);
        return json({ ok: true, requestId });
      } catch (error) {
        return json({ error: error.message || 'Redeem request failed' }, 502);
      }
    }

    // Polled by the website after a redeem request to find out whether the
    // mod actually processed it (and whether it succeeded).
    if (url.pathname === '/redeem-result' && request.method === 'GET') {
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      if (env.STATUS_API_TOKEN && token !== env.STATUS_API_TOKEN) {
        return json({ error: 'Unauthorized' }, 401);
      }
      const steamId = url.searchParams.get('steamId');
      const requestId = url.searchParams.get('requestId');
      if (!steamId || !/^\d{17}$/.test(steamId) || !requestId) {
        return json({ error: 'Missing or invalid steamId/requestId' }, 400);
      }
      try {
        const result = await readRedeemResult(env, steamId, requestId);
        return json(result ? { ok: result.ok, message: result.message, processedAt: result.processedAt } : { ok: null });
      } catch (error) {
        return json({ error: error.message || 'Redeem result lookup failed' }, 502);
      }
    }

    // Website admin panel — tells the site whether to show the Admin Panel
    // tab at all. Not itself a security boundary (that's the POST routes
    // below, which re-check tier server-side); this is purely UI reveal.
    if (url.pathname === '/admin-tier' && request.method === 'GET') {
      const steamId = url.searchParams.get('steamId');
      if (!steamId || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (!env.PARKED_KV) return json({ tier: null });
      try {
        const tier = await getAdminTier(env, steamId);
        return json({ tier });
      } catch (error) {
        return json({ error: error.message || 'Tier lookup failed' }, 502);
      }
    }

    // Public staff roster — the Community tab's "meet the team" listing.
    // Unlike /admin-tier this is intentionally unauthenticated: it's a
    // public transparency page, not an admin-only action, and returns
    // nothing beyond what's already public knowledge in-game (who has
    // admin, at what tier).
    if (url.pathname === '/admin-roster-public' && request.method === 'GET') {
      if (!env.PARKED_KV) return json({ owner: [], senior: [], admin: [] });
      const raw = await env.PARKED_KV.get('admin_tiers:index');
      if (!raw) return json({ owner: [], senior: [], admin: [] });
      try {
        const tiers = JSON.parse(raw);
        return json({
          owner: Array.isArray(tiers.owner) ? tiers.owner : [],
          senior: Array.isArray(tiers.senior) ? tiers.senior : [],
          admin: Array.isArray(tiers.admin) ? tiers.admin : [],
        });
      } catch {
        return json({ owner: [], senior: [], admin: [] });
      }
    }

    // Compensation: an admin grants a player a redeemable dino snapshot
    // without touching the game server directly. Reuses the exact file
    // format main.lua's !park already produces, so !redeem / the website's
    // Redeem button need no changes to pick it up.
    if (url.pathname === '/compensation-grant' && request.method === 'POST') {
      if (!env.PTERODACTYL_API_KEY || !env.PTERODACTYL_BASE_URL || !env.PTERODACTYL_SERVER_ID || !env.PARKED_KV) {
        return json({ error: 'Bridge is not configured' }, 503);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { granterSteamId, targetSteamId, species, name, growthPct, healthPct, staminaPct, hungerPct, thirstPct } = body || {};
      if (typeof granterSteamId !== 'string' || !/^\d{17}$/.test(granterSteamId)) {
        return json({ error: 'Missing or invalid granterSteamId' }, 400);
      }
      if (typeof targetSteamId !== 'string' || !/^\d{17}$/.test(targetSteamId)) {
        return json({ error: 'Missing or invalid targetSteamId' }, 400);
      }
      if (typeof species !== 'string' || !KNOWN_SPECIES.includes(species)) {
        return json({ error: 'Invalid species' }, 400);
      }
      const tier = await getAdminTier(env, granterSteamId);
      if (!tier) return json({ error: 'Not an admin' }, 403);

      const dino = {
        name: typeof name === 'string' ? name.slice(0, 24) : '',
        classPath: classPathForSpecies(species),
        growth: pctToFraction(growthPct ?? 100),
        health: pctToFraction(healthPct ?? 100),
        maxHealth: 1,
        stamina: pctToFraction(staminaPct ?? 100),
        hunger: pctToFraction(hungerPct ?? 100),
        thirst: pctToFraction(thirstPct ?? 100),
        maxHunger: 1,
        maxThirst: 1,
        maxStamina: 1,
        primeElder: false,
        bodyColorR: 0,
        bodyColorG: 0,
        bodyColorB: 0,
        capturedAt: Math.floor(Date.now() / 1000),
      };
      try {
        await grantCompensationDino(env, targetSteamId, dino);
        return json({ ok: true, dino });
      } catch (error) {
        return json({ error: error.message || 'Compensation grant failed' }, 502);
      }
    }

    // Inventory: a player renames one of their own parked dinos. Same
    // read-modify-write as compensation, but on an existing entry (matched
    // by capturedAt, which doubles as its snapshot id — see main.lua) and
    // gated to the dino's own owner, not an admin tier.
    if (url.pathname === '/rename-parked-dino' && request.method === 'POST') {
      if (!env.PTERODACTYL_API_KEY || !env.PTERODACTYL_BASE_URL || !env.PTERODACTYL_SERVER_ID) {
        return json({ error: 'Bridge is not configured' }, 503);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { steamId, requesterSteamId, snapshotId, name } = body || {};
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (requesterSteamId !== steamId) {
        return json({ error: 'Not the owner of this dino' }, 403);
      }
      if (typeof snapshotId !== 'number') {
        return json({ error: 'Missing or invalid snapshotId' }, 400);
      }
      if (typeof name !== 'string') {
        return json({ error: 'Invalid name' }, 400);
      }
      try {
        const dinos = await readParkedDinosArray(env, steamId);
        const dino = dinos.find((d) => d.capturedAt === snapshotId);
        if (!dino) return json({ error: 'Snapshot not found' }, 404);
        dino.name = name.slice(0, 24);
        await writeParkedDinosArray(env, steamId, dinos);
        return json({ ok: true, dino });
      } catch (error) {
        return json({ error: error.message || 'Rename failed' }, 502);
      }
    }

    // Inventory: a player releases (deletes) one of their own parked dinos.
    // Irreversible — the website gates this behind a confirm dialog before
    // ever calling here, but the real gate is the owner check below.
    if (url.pathname === '/release-parked-dino' && request.method === 'POST') {
      if (!env.PTERODACTYL_API_KEY || !env.PTERODACTYL_BASE_URL || !env.PTERODACTYL_SERVER_ID) {
        return json({ error: 'Bridge is not configured' }, 503);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { steamId, requesterSteamId, snapshotId } = body || {};
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (requesterSteamId !== steamId) {
        return json({ error: 'Not the owner of this dino' }, 403);
      }
      if (typeof snapshotId !== 'number') {
        return json({ error: 'Missing or invalid snapshotId' }, 400);
      }
      try {
        const dinos = await readParkedDinosArray(env, steamId);
        const nextDinos = dinos.filter((d) => d.capturedAt !== snapshotId);
        if (nextDinos.length === dinos.length) return json({ error: 'Snapshot not found' }, 404);
        await writeParkedDinosArray(env, steamId, nextDinos);
        return json({ ok: true });
      } catch (error) {
        return json({ error: error.message || 'Release failed' }, 502);
      }
    }

    // Strikes: pure Cloudflare-side records, never touch the game server —
    // already outside any admin's file-system reach, so no hash chain is
    // needed here the way the game-server-side audit log needs one.
    if (url.pathname === '/strikes-issue' && request.method === 'POST') {
      if (!env.PARKED_KV) return json({ error: 'Bridge is not configured' }, 503);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { issuerSteamId, targetSteamId, reason, evidence } = body || {};
      if (typeof issuerSteamId !== 'string' || !/^\d{17}$/.test(issuerSteamId)) {
        return json({ error: 'Missing or invalid issuerSteamId' }, 400);
      }
      if (typeof targetSteamId !== 'string' || !/^\d{17}$/.test(targetSteamId)) {
        return json({ error: 'Missing or invalid targetSteamId' }, 400);
      }
      if (typeof reason !== 'string' || reason.trim() === '') {
        return json({ error: 'Reason is required' }, 400);
      }
      const issuerTier = await getAdminTier(env, issuerSteamId);
      if (!issuerTier) return json({ error: 'Not an admin' }, 403);

      const issuedAt = Date.now();
      const strike = {
        targetSteamId,
        reason: reason.slice(0, 2000),
        evidence: typeof evidence === 'string' ? evidence.slice(0, 2000) : '',
        issuerSteamId,
        issuerTier,
        issuedAt,
      };
      try {
        await env.PARKED_KV.put(`strikes:${targetSteamId}:${issuedAt}`, JSON.stringify(strike));
        return json({ ok: true, strike });
      } catch (error) {
        return json({ error: error.message || 'Strike issue failed' }, 502);
      }
    }

    if (url.pathname === '/strikes-list' && request.method === 'GET') {
      if (!env.PARKED_KV) return json({ error: 'Bridge is not configured' }, 503);
      const targetSteamId = url.searchParams.get('targetSteamId');
      const requesterSteamId = url.searchParams.get('requesterSteamId');
      if (!targetSteamId || !/^\d{17}$/.test(targetSteamId)) {
        return json({ error: 'Missing or invalid targetSteamId' }, 400);
      }
      if (!requesterSteamId || !/^\d{17}$/.test(requesterSteamId)) {
        return json({ error: 'Missing or invalid requesterSteamId' }, 400);
      }
      const requesterTier = await getAdminTier(env, requesterSteamId);
      if (!requesterTier) return json({ error: 'Not an admin' }, 403);

      try {
        const list = await env.PARKED_KV.list({ prefix: `strikes:${targetSteamId}:` });
        const strikes = await Promise.all(
          list.keys.map(async (key) => {
            const raw = await env.PARKED_KV.get(key.name);
            try {
              return JSON.parse(raw);
            } catch {
              return null;
            }
          }),
        );
        const cleaned = strikes.filter(Boolean).sort((a, b) => b.issuedAt - a.issuedAt);
        return json({ ok: true, strikes: cleaned });
      } catch (error) {
        return json({ error: error.message || 'Strike list failed' }, 502);
      }
    }

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

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      syncParkedDinos(env).catch((error) => console.error('syncParkedDinos failed:', error.message)),
    );
    ctx.waitUntil(
      syncAdminAuditLog(env).catch((error) => console.error('syncAdminAuditLog failed:', error.message)),
    );
    ctx.waitUntil(
      syncAdminTiers(env).catch((error) => console.error('syncAdminTiers failed:', error.message)),
    );
  },
};
