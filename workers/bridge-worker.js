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
  // KV writes are capped at 1,000/day on Cloudflare's free plan, and this
  // sync runs every minute — writing unconditionally burned the whole
  // daily quota in under a day (confirmed live: "KV put() limit exceeded
  // for the day" started blocking every sync, including the on-demand one
  // /api/parked-list triggers right after a grant/park/redeem — the
  // actual root cause of a just-granted compensation dino not showing up
  // in Inventory). Only write when the parked data actually differs from
  // what's already stored.
  const existingRaw = await env.PARKED_KV.get('parked:index');
  let existingParked = null;
  if (existingRaw) {
    try {
      existingParked = JSON.parse(existingRaw).parked || {};
    } catch {
      existingParked = null;
    }
  }
  if (JSON.stringify(existingParked) !== JSON.stringify(parked)) {
    await env.PARKED_KV.put('parked:index', JSON.stringify({ updatedAt: Date.now(), parked }));
  }
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

const skinUseRequestPath = (steamId) => `${REDEEM_SAVED_DIR}/skin_use_request_${steamId}.json`;
const skinUseResultPath = (steamId) => `${REDEEM_SAVED_DIR}/skin_use_result_${steamId}.json`;
// Deliberately does NOT touch the charge ledger here — main.lua only
// decrements a charge after a confirmed successful apply (see
// trySkinUse), so a failed live-use (no live pawn, unknown code) never
// burns one. This just queues the request the same way park/redeem do.
const requestSkinUse = (env, steamId, skinCode) => writeRequest(env, skinUseRequestPath, steamId, { skinCode });
const readSkinUseResult = (env, steamId, requestId) => readResult(env, skinUseResultPath, steamId, requestId);

const teleportExecuteRequestPath = (steamId) => `${REDEEM_SAVED_DIR}/teleport_execute_request_${steamId}.json`;
// steamId here is the MOVER (whoever's pawn is about to relocate), not
// necessarily the person who clicked Accept — see /teleport-accept, which
// works out which of the two friends that is based on `direction`. No
// result-polling route for this one (unlike park/redeem/skin-use): the
// person who accepts isn't always the mover, so "poll for my own result"
// doesn't fit — both friends instead get an in-game notification from
// main.lua's checkWebsiteTeleportRequest once it actually happens.
const requestTeleportExecute = (env, moverSteamId, referenceSteamId) =>
  writeRequest(env, teleportExecuteRequestPath, moverSteamId, { referenceSteamId });

const growthPauseRequestPath = (steamId) => `${REDEEM_SAVED_DIR}/growth_pause_request_${steamId}.json`;
const growthPauseResultPath = (steamId) => `${REDEEM_SAVED_DIR}/growth_pause_result_${steamId}.json`;
// Written by main.lua's poll loop every tick for whichever players are
// online+spawned (see the mod's growthStatusFilePath comment) — not a
// request/result pair, just a status snapshot this Worker reads as-is.
const growthStatusPath = (steamId) => `${REDEEM_SAVED_DIR}/growth_status_${steamId}.json`;

const requestGrowthPause = (env, steamId, action) => writeRequest(env, growthPauseRequestPath, steamId, { action });
const readGrowthPauseResult = (env, steamId, requestId) => readResult(env, growthPauseResultPath, steamId, requestId);

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
  const next = {
    owner: Array.isArray(tiers.owner) ? tiers.owner : [],
    senior: Array.isArray(tiers.senior) ? tiers.senior : [],
    admin: Array.isArray(tiers.admin) ? tiers.admin : [],
  };
  // See syncParkedDinos for why this comparison exists: an unconditional
  // write every tick (this sync runs every minute) blew through
  // Cloudflare's 1,000-writes/day free KV quota on its own.
  const existingRaw = await env.PARKED_KV.get('admin_tiers:index');
  let existing = null;
  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      existing = { owner: parsed.owner || [], senior: parsed.senior || [], admin: parsed.admin || [] };
    } catch {
      existing = null;
    }
  }
  if (JSON.stringify(existing) !== JSON.stringify(next)) {
    await env.PARKED_KV.put('admin_tiers:index', JSON.stringify({ ...next, updatedAt: Date.now() }));
  }
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

// ── Player directory (admin panel name-search autocomplete) ──
//
// The Steam Web API's GetPlayerSummaries can resolve a known steamId to a
// name, but has no search-by-name capability at all (confirmed this
// session) — so a "type a name, get a dropdown of matching steamIds" admin
// panel feature has to be built from data this server already produces:
// TheIsle.log's own LogTheIsleJoinData lines, e.g.
//   LogTheIsleJoinData: [2026.09.11-11.54.57] AyoSidhu (Ubbe) [76561198274950397] Joined The Server.
// (Isle's own logging truncates long Steam-name+character-name combos —
// confirmed live, e.g. "Ayo Sidhu Paaji (Ubb" with no closing paren — this
// is the game engine's own log formatting, not a parsing bug here.)
//
// Merges newly-seen name/steamId pairs into a single KV index rather than
// tracking a seq/offset into the log (unlike the admin audit log): the log
// FILE itself rotates to a TheIsle-backup-*.log on every server restart
// and a fresh, empty TheIsle.log starts in its place, so an offset
// wouldn't survive that. Every tick re-scans the current live file (cheap,
// self-healing) plus any backup file this hasn't scanned yet (tracked in
// its own small "already scanned" KV list, so each immutable backup is
// only ever fetched once — this also one-time-backfills every player who
// joined before this feature existed, not just future joins). A player's
// directory entry persists in KV forever once seen, even after their join
// line rotates out of the live log or their backup file eventually ages
// out.
const GAME_LOGS_DIR = '/TheIsle/Saved/Logs';
const GAME_LOG_PATH = `${GAME_LOGS_DIR}/TheIsle.log`;
const JOIN_LINE_RE = /LogTheIsleJoinData: \[[^\]]+\] (.+?) \[(\d{17})\] Joined The Server/g;

const mergeJoinLines = (raw, players) => {
  let match;
  JOIN_LINE_RE.lastIndex = 0;
  while ((match = JOIN_LINE_RE.exec(raw)) !== null) {
    const name = match[1].trim();
    const steamId = match[2];
    if (name) players[steamId] = { name, lastSeen: Date.now() };
  }
};

const syncPlayerDirectory = async (env) => {
  const existingRaw = await env.PARKED_KV.get('player_directory:index');
  let players = {};
  if (existingRaw) {
    try {
      players = JSON.parse(existingRaw).players || {};
    } catch {
      players = {};
    }
  }
  const existingPlayersSnapshot = JSON.parse(JSON.stringify(players));

  try {
    const response = await pterodactylFetch(env, `/files/contents?file=${encodeURIComponent(GAME_LOG_PATH)}`);
    mergeJoinLines(await response.text(), players);
  } catch {
    // no one has joined since the last restart yet — fine, backup catch-up below still runs
  }

  let scannedBackups = [];
  const scannedRaw = await env.PARKED_KV.get('player_directory:scanned_backups');
  if (scannedRaw) {
    try {
      scannedBackups = JSON.parse(scannedRaw);
    } catch {
      scannedBackups = [];
    }
  }
  try {
    const listResponse = await pterodactylFetch(env, `/files/list?directory=${encodeURIComponent(GAME_LOGS_DIR)}`);
    const listBody = await listResponse.json();
    const backupNames = (listBody.data || [])
      .map((entry) => entry.attributes)
      .filter((attrs) => attrs?.is_file && /^TheIsle-backup-.*\.log$/.test(attrs.name))
      .map((attrs) => attrs.name);
    const newBackups = backupNames.filter((name) => !scannedBackups.includes(name));
    for (const name of newBackups) {
      try {
        const backupResponse = await pterodactylFetch(env, `/files/contents?file=${encodeURIComponent(`${GAME_LOGS_DIR}/${name}`)}`);
        mergeJoinLines(await backupResponse.text(), players);
        scannedBackups.push(name);
      } catch {
        // failed to fetch this one this tick — not marked scanned, so it's retried next tick
      }
    }
    if (newBackups.length > 0) {
      await env.PARKED_KV.put('player_directory:scanned_backups', JSON.stringify(scannedBackups));
    }
  } catch {
    // directory listing failed this tick — live-file merge above still ran
  }

  // KV writes are capped at 1,000/day on Cloudflare's free plan, and this
  // sync runs every minute — an unconditional write here (plus the same in
  // syncParkedDinos/syncAdminTiers) burned the whole daily quota in under a
  // day (confirmed live: "KV put() limit exceeded for the day" started
  // blocking every sync, including the on-demand one /api/parked-list
  // triggers right after a grant/park/redeem — the actual root cause of a
  // just-granted compensation dino not showing up in Inventory). Only
  // write when a join was actually merged in above, by comparing against
  // the SAME parsed snapshot this function already loaded into `players`
  // before merging (existingPlayersSnapshot, captured right after load).
  if (JSON.stringify(existingPlayersSnapshot) !== JSON.stringify(players)) {
    await env.PARKED_KV.put('player_directory:index', JSON.stringify({ updatedAt: Date.now(), players }));
  }
  return { synced: Object.keys(players).length };
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

// Best-effort diet classification per species, matching ETIMutationTypes'
// Carnivore/Herbivore split — NOT yet confirmed against the game's own
// data (same caveat as KNOWN_MUTATIONS below). Gallimimus is the one
// genuine omnivore among these 22; omnivores are treated as eligible for
// BOTH carnivore and herbivore mutations (a permissive guess, not a
// confirmed rule) since there's no third ETIMutationTypes bucket for them.
const SPECIES_DIET = {
  Allosaurus: 'carnivore',
  Austroraptor: 'carnivore',
  Beipiaosaurus: 'herbivore',
  Carnotaurus: 'carnivore',
  Ceratosaurus: 'carnivore',
  Deinosuchus: 'carnivore',
  Diabloceratops: 'herbivore',
  Dilophosaurus: 'carnivore',
  Dryosaurus: 'herbivore',
  Gallimimus: 'omnivore',
  Herrerasaurus: 'carnivore',
  Hypsilophodon: 'herbivore',
  Kentrosaurus: 'herbivore',
  Maiasaura: 'herbivore',
  Omniraptor: 'carnivore',
  Pachycephalosaurus: 'herbivore',
  Pteranodon: 'carnivore',
  Stegosaurus: 'herbivore',
  Tenontosaurus: 'herbivore',
  Triceratops: 'herbivore',
  Troodon: 'carnivore',
  Tyrannosaurus: 'carnivore',
};

// True if a mutation with this diet tag is eligible for a species with
// this diet — generic mutations are always eligible, an omnivore species
// is eligible for either pool, and otherwise the diets must match exactly.
const mutationDietAllowed = (mutationDiet, speciesDiet) =>
  mutationDiet === 'generic' || speciesDiet === 'omnivore' || mutationDiet === speciesDiet;

// Mirrors main.lua's MUTATION_SLOT_FIELDS (JSON keys are lowerCamelCase of
// the PascalCase struct field names Lua uses) — 4 base + 4 "parent" + 8
// "elder" split A/B, confirmed via a live GenerateSDK dump of TheIsle.hpp.
// Grouped by which entombment level (0-3) unlocks each tier.
const MUTATION_SLOT_TIERS = [
  ['mutationSlot1', 'mutationSlot2', 'mutationSlot3', 'mutationSlot4'],
  ['parentMutationSlot1', 'parentMutationSlot2', 'parentMutationSlot3', 'parentMutationSlot4'],
  ['elderMutationSlot1A', 'elderMutationSlot2A', 'elderMutationSlot3A', 'elderMutationSlot4A'],
  ['elderMutationSlot1B', 'elderMutationSlot2B', 'elderMutationSlot3B', 'elderMutationSlot4B'],
];
const MUTATION_SLOT_FIELDS = MUTATION_SLOT_TIERS.flat();

// Sourced from two independent community wikis (theisle.info,
// evrimaquickguide.com) plus exact FNames given verbatim in the
// diplomatic-tendencies/evrima-dev-knowledge repo for quest-unlockable
// ones — NOT yet cross-checked against this build's own live mutation
// catalog (main.lua's tryMutationDumpOnce is queued to log that the next
// time anyone spawns in; reconcile this list once it fires). Diet tag
// mirrors ETIMutationTypes (Carnivore/Herbivore/Generic) for the
// frontend's per-species dropdown filtering; server-side validation stays
// permissive across diets since that gating isn't confirmed and
// over-restricting would just block legitimate grants.
const KNOWN_MUTATIONS = [
  { name: 'Cellular Regeneration', diet: 'generic' },
  { name: 'Congenital Hypoalgesia', diet: 'generic' },
  { name: 'Epidermal Fibrosis', diet: 'generic' },
  { name: 'Osteosclerosis', diet: 'generic' },
  { name: 'Photosynthetic Tissue', diet: 'generic' },
  { name: 'Enlarged Meniscus', diet: 'generic' },
  { name: 'Efficient Digestion', diet: 'generic' },
  { name: 'Featherweight', diet: 'generic' },
  { name: 'Hydrodynamic', diet: 'generic' },
  { name: 'Reabsorption', diet: 'generic' },
  { name: 'Advanced Gestation', diet: 'generic' },
  { name: 'Sustained Hydration', diet: 'generic' },
  { name: 'Accelerated Prey Drive', diet: 'carnivore' },
  { name: 'Hematophagy', diet: 'carnivore' },
  { name: 'Hemomania', diet: 'carnivore' },
  { name: 'Cannibalistic', diet: 'carnivore' },
  { name: 'Truculency', diet: 'carnivore' },
  { name: 'Hypermetabolic Inanition', diet: 'carnivore' },
  { name: 'Tactile Endurance', diet: 'herbivore' },
  { name: 'Barometric Sensitivity', diet: 'herbivore' },
  { name: 'Hypervigilance', diet: 'herbivore' },
  { name: 'Photosynthetic Regeneration', diet: 'herbivore' },
  { name: 'Xerocole Adaptation', diet: 'herbivore' },
  { name: 'Social Behavior', diet: 'herbivore' },
  { name: 'Wader', diet: 'herbivore' },
  { name: 'Reniculate Kidneys', diet: 'generic' },
  { name: 'Reinforced Tendons', diet: 'generic' },
  { name: 'Multichambered Lungs', diet: 'generic' },
  { name: 'Osteophagic', diet: 'generic' },
  { name: 'Augmented Tapetum', diet: 'generic' },
  { name: 'Parthenogenesis', diet: 'generic' },
  { name: 'Prolific Reproduction', diet: 'generic' },
  { name: 'Enhanced Digestion', diet: 'generic' },
  { name: 'Heightened Ghrelin', diet: 'generic' },
];
const KNOWN_MUTATION_NAMES = new Set(KNOWN_MUTATIONS.map((m) => m.name));
const KNOWN_MUTATION_DIET = new Map(KNOWN_MUTATIONS.map((m) => [m.name, m.diet]));

// Glitch skins: the 10 FCustomizerDataBase color fields (0.21.720+), same
// set main.lua's applyCustomizer knows about. PatternIndex/SkinVariation are
// deliberately not exposed here at all — see the admin-panel plan doc and
// main.lua's own comment for why (PatternIndex is per-species range-gated
// and a bad value silently drops the whole apply, colors included).
const SKIN_COLOR_FIELDS = [
  'BodyColor', 'MarkingsColor', 'FlankColor', 'UnderbellyColor',
  'Detail1Color', 'EyesColor', 'MaleDisplayColor',
  'TeethColor', 'MouthColor', 'ClawsColor',
];

const hexToLinearColor = (hex) => {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
    a: 1,
  };
};

// Deliberately NOT clamped to 0-1 — "glitch skins" as a genre relies on
// extreme/negative FLinearColor values for the HDR/inverted look (the
// customizer field-map doc confirms values above 1.0 render as stable HDR
// glow; nothing in that doc or our own testing rules out negative values
// either). Only guards against genuinely degenerate input (NaN, Infinity,
// or magnitudes big enough to be a typo rather than a deliberate glitch
// value) so a bad write can't produce something pathological.
const GLITCH_COLOR_BOUND = 100000;
const sanitizeColorNumber = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(GLITCH_COLOR_BOUND, Math.max(-GLITCH_COLOR_BOUND, n));
};

// Accepts either a hex string ("#RRGGBB", from the picker UI) or a
// pre-built {r,g,b,a} object (from the Advanced JSON path) per field, and
// normalizes everything to the same {r,g,b,a} shape regardless of which UI
// path the admin used. The object path accepts R/G/B/A in either case —
// uppercase matches the actual Unreal struct field names (what an admin
// pasting real customizer values would naturally write), lowercase matches
// this project's own persisted-file convention (and the community SkinMod's).
const normalizeSkinColors = (colors) => {
  const normalized = {};
  for (const field of SKIN_COLOR_FIELDS) {
    const value = colors?.[field];
    if (value == null) continue;
    if (typeof value === 'string') {
      const rgb = hexToLinearColor(value);
      if (rgb) normalized[field] = rgb;
    } else if (typeof value === 'object') {
      const r = value.r ?? value.R;
      const g = value.g ?? value.G;
      const b = value.b ?? value.B;
      const a = value.a ?? value.A;
      if (r != null && g != null && b != null) {
        normalized[field] = {
          r: sanitizeColorNumber(r),
          g: sanitizeColorNumber(g),
          b: sanitizeColorNumber(b),
          a: a != null ? sanitizeColorNumber(a) : 1,
        };
      }
    }
  }
  return normalized;
};

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

// Skin charge ledger — same read-modify-write shape as the parked-dino
// helpers above. main.lua's own reader/writer (loadSkinCharges/
// writeSkinCharges) uses this exact envelope, so either side can touch the
// file without the other needing to change.
const skinChargesFilePathFor = (steamId) => `${PARKED_SAVED_DIR}/skin_charges_${steamId}.json`;

const readSkinCharges = async (env, steamId) => {
  try {
    const response = await pterodactylFetch(env, `/files/contents?file=${encodeURIComponent(skinChargesFilePathFor(steamId))}`);
    const raw = await response.text();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.skins) ? parsed.skins : [];
  } catch {
    return []; // no existing file for this player yet
  }
};

const writeSkinCharges = async (env, steamId, skins) => {
  const body = JSON.stringify({ skins });
  await pterodactylWriteFile(env, skinChargesFilePathFor(steamId), body);
};

const pctToFraction = (value) => Math.min(100, Math.max(0, Number(value) || 0)) / 100;

// Player/admin-facing reference code generator — used for both compensation
// grants (COMP-XXXX) and skin charges (SKIN-XXXX). Deliberately NOT
// capturedAt for compensation dinos (that stays a plain Unix-timestamp
// number always; main.lua's own JSON reader parses it with a digits-only
// regex for !redeem's recency sorting and the "parked Xm ago" age display,
// so it has to stay numeric) — these codes are purely additive fields
// main.lua either never reads (compCode) or reads by exact string match
// only (a skin's code), never parsed as a number either way. Excludes
// 0/O/1/I to avoid on-screen ambiguity.
const REFERENCE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateReferenceCode = (prefix) => {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += REFERENCE_CODE_CHARS[Math.floor(Math.random() * REFERENCE_CODE_CHARS.length)];
  }
  return `${prefix}-${code}`;
};
const generateCompCode = () => generateReferenceCode('COMP');
const generateSkinCode = () => generateReferenceCode('SKIN');

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

    // Mutation catalog for the Compensation form's dropdowns — see
    // KNOWN_MUTATIONS above for sourcing/caveats. No admin gate, same
    // transparency posture as /admin-roster-public: this is read-only,
    // sourced from public wikis, and grants nothing by itself.
    if (url.pathname === '/mutations-catalog' && request.method === 'GET') {
      return json({ ok: true, mutations: KNOWN_MUTATIONS, tiers: MUTATION_SLOT_TIERS, speciesDiet: SPECIES_DIET });
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
      const { granterSteamId, targetSteamId, species, name, growthPct, healthPct, staminaPct, hungerPct, thirstPct, entombments: entombmentsRaw, mutations: mutationsInput } = body || {};
      if (typeof granterSteamId !== 'string' || !/^\d{17}$/.test(granterSteamId)) {
        return json({ error: 'Missing or invalid granterSteamId' }, 400);
      }
      if (typeof targetSteamId !== 'string' || !/^\d{17}$/.test(targetSteamId)) {
        return json({ error: 'Missing or invalid targetSteamId' }, 400);
      }
      if (typeof species !== 'string' || !KNOWN_SPECIES.includes(species)) {
        return json({ error: 'Invalid species' }, 400);
      }
      const entombments = entombmentsRaw == null ? 0 : Number(entombmentsRaw);
      if (!Number.isInteger(entombments) || entombments < 0 || entombments > 3) {
        return json({ error: 'entombments must be an integer 0-3' }, 400);
      }
      // Only slots within the tiers this entombment level actually unlocks
      // (see MUTATION_SLOT_TIERS) — rejecting an out-of-tier slot outright
      // rather than silently dropping it, so a mismatched form submission
      // surfaces as a clear error instead of a quietly incomplete grant.
      const allowedMutationFields = new Set(MUTATION_SLOT_TIERS.slice(0, entombments + 1).flat());
      const mutations = {};
      if (mutationsInput != null) {
        if (typeof mutationsInput !== 'object') {
          return json({ error: 'mutations must be an object' }, 400);
        }
        for (const [field, value] of Object.entries(mutationsInput)) {
          if (value == null || value === '') continue;
          if (!MUTATION_SLOT_FIELDS.includes(field)) {
            return json({ error: `Unknown mutation slot: ${field}` }, 400);
          }
          if (!allowedMutationFields.has(field)) {
            return json({ error: `Mutation slot ${field} needs a higher entombment level` }, 400);
          }
          if (typeof value !== 'string' || !KNOWN_MUTATION_NAMES.has(value)) {
            return json({ error: `Unknown mutation name: ${value}` }, 400);
          }
          const speciesDiet = SPECIES_DIET[species] || 'omnivore';
          if (!mutationDietAllowed(KNOWN_MUTATION_DIET.get(value), speciesDiet)) {
            return json({ error: `${value} isn't available to a ${speciesDiet} species like ${species}` }, 400);
          }
          mutations[field] = value;
        }
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
        compCode: generateCompCode(),
        entombments,
        // health/stamina/hunger/thirst above are 0-1 fractions (this route
        // only ever gets a percentage, never a species' real max-stat
        // curve) — main.lua's applyStateToPawn needs this flag to scale by
        // the pawn's own freshly-computed max at redeem time instead of
        // treating them as absolute point values like a real !park capture.
        statsArePercentages: true,
        ...mutations,
      };
      try {
        await grantCompensationDino(env, targetSteamId, dino);
        return json({ ok: true, dino });
      } catch (error) {
        return json({ error: error.message || 'Compensation grant failed' }, 502);
      }
    }

    // Glitch skins v2: admins grant CHARGES of a named skin, not a direct
    // apply — an earlier version wrote skin_<steamid>.json directly and
    // auto-restored it to whatever pawn a player currently had, which
    // leaked the skin onto every dino they later redeemed. Now nothing
    // touches a live pawn at grant time; a player spends a charge later
    // via /skin-use-live (this pawn only, one-shot) or /skin-attach-parked
    // (baked into one specific snapshot, applied at redeem time).
    if (url.pathname === '/skin-grant-charges' && request.method === 'POST') {
      if (!env.PTERODACTYL_API_KEY || !env.PTERODACTYL_BASE_URL || !env.PTERODACTYL_SERVER_ID || !env.PARKED_KV) {
        return json({ error: 'Bridge is not configured' }, 503);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { granterSteamId, targetSteamId, name, count, colors } = body || {};
      if (typeof granterSteamId !== 'string' || !/^\d{17}$/.test(granterSteamId)) {
        return json({ error: 'Missing or invalid granterSteamId' }, 400);
      }
      if (typeof targetSteamId !== 'string' || !/^\d{17}$/.test(targetSteamId)) {
        return json({ error: 'Missing or invalid targetSteamId' }, 400);
      }
      if (typeof name !== 'string' || name.trim() === '') {
        return json({ error: 'Skin name is required' }, 400);
      }
      const chargeCount = Math.floor(Number(count));
      if (!Number.isFinite(chargeCount) || chargeCount < 1) {
        return json({ error: 'Charge count must be at least 1' }, 400);
      }
      if (!colors || typeof colors !== 'object') {
        return json({ error: 'Missing or invalid colors' }, 400);
      }
      const tier = await getAdminTier(env, granterSteamId);
      if (!tier) return json({ error: 'Not an admin' }, 403);

      const normalized = normalizeSkinColors(colors);
      if (Object.keys(normalized).length === 0) {
        return json({ error: 'No valid color fields provided' }, 400);
      }
      try {
        const skins = await readSkinCharges(env, targetSteamId);
        const trimmedName = name.trim().slice(0, 40);
        const existing = skins.find((entry) => entry.name === trimmedName);
        let granted;
        if (existing) {
          existing.charges = (existing.charges || 0) + chargeCount;
          existing.colors = normalized;
          existing.code = generateSkinCode();
          granted = existing;
        } else {
          granted = { name: trimmedName, code: generateSkinCode(), colors: normalized, charges: chargeCount };
          skins.push(granted);
        }
        await writeSkinCharges(env, targetSteamId, skins);
        return json({ ok: true, skin: granted });
      } catch (error) {
        return json({ error: error.message || 'Skin grant failed' }, 502);
      }
    }

    // Inventory: a player's own skin-charge ledger. Same trust model as
    // /api/parked-list — client-supplied steamId, no separate requester
    // check (read-only, their own data, not a new gap on this site).
    if (url.pathname === '/skin-charges' && request.method === 'GET') {
      const steamId = url.searchParams.get('steamId');
      if (!steamId || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      try {
        const skins = await readSkinCharges(env, steamId);
        return json({ ok: true, skins });
      } catch (error) {
        return json({ error: error.message || 'Skin charges lookup failed' }, 502);
      }
    }

    // Inventory: spend one charge on the player's CURRENT live dino —
    // one-shot, does not persist past this pawn's life (no auto-restore
    // exists for this path by design). Self-service, not admin-gated.
    if (url.pathname === '/skin-use-live' && request.method === 'POST') {
      if (!env.PTERODACTYL_API_KEY || !env.PTERODACTYL_BASE_URL || !env.PTERODACTYL_SERVER_ID) {
        return json({ error: 'Bridge is not configured' }, 503);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { steamId, requesterSteamId, skinCode } = body || {};
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (requesterSteamId !== steamId) {
        return json({ error: 'Not the owner of these charges' }, 403);
      }
      if (typeof skinCode !== 'string' || skinCode === '') {
        return json({ error: 'Missing or invalid skinCode' }, 400);
      }
      try {
        const requestId = await requestSkinUse(env, steamId, skinCode);
        return json({ ok: true, requestId });
      } catch (error) {
        return json({ error: error.message || 'Skin use request failed' }, 502);
      }
    }

    if (url.pathname === '/skin-use-result' && request.method === 'GET') {
      const steamId = url.searchParams.get('steamId');
      const requestId = url.searchParams.get('requestId');
      if (!steamId || !/^\d{17}$/.test(steamId) || !requestId) {
        return json({ error: 'Missing or invalid steamId/requestId' }, 400);
      }
      try {
        const result = await readSkinUseResult(env, steamId, requestId);
        return json(result ? { ok: result.ok, message: result.message, processedAt: result.processedAt } : { ok: null });
      } catch (error) {
        return json({ error: error.message || 'Skin use result lookup failed' }, 502);
      }
    }

    // Live Dino tab: pause/resume growth on the caller's own live dino.
    // main.lua's tryGrowthPauseToggle is the actual authority on the
    // 50%-99% range check (it reads the live pawn's real Growth value) —
    // this route just queues the request the same way skin-use does.
    if (url.pathname === '/growth-pause-request' && request.method === 'POST') {
      if (!env.PTERODACTYL_API_KEY || !env.PTERODACTYL_BASE_URL || !env.PTERODACTYL_SERVER_ID) {
        return json({ error: 'Bridge is not configured' }, 503);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { steamId, action } = body || {};
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (action !== 'pause' && action !== 'resume') {
        return json({ error: 'action must be "pause" or "resume"' }, 400);
      }
      try {
        const requestId = await requestGrowthPause(env, steamId, action);
        return json({ ok: true, requestId });
      } catch (error) {
        return json({ error: error.message || 'Growth pause request failed' }, 502);
      }
    }

    if (url.pathname === '/growth-pause-result' && request.method === 'GET') {
      const steamId = url.searchParams.get('steamId');
      const requestId = url.searchParams.get('requestId');
      if (!steamId || !/^\d{17}$/.test(steamId) || !requestId) {
        return json({ error: 'Missing or invalid steamId/requestId' }, 400);
      }
      try {
        const result = await readGrowthPauseResult(env, steamId, requestId);
        return json(result ? { ok: result.ok, message: result.message, processedAt: result.processedAt } : { ok: null });
      } catch (error) {
        return json({ error: error.message || 'Growth pause result lookup failed' }, 502);
      }
    }

    // Live Dino tab: current paused/growth snapshot, refreshed every poll
    // tick by main.lua for online+spawned players. Not found yet (no file
    // written since the last restart, or the player has never been
    // spawned) just reads back as "not paused" rather than an error.
    if (url.pathname === '/growth-status' && request.method === 'GET') {
      const steamId = url.searchParams.get('steamId');
      if (!steamId || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      try {
        const response = await pterodactylFetch(env, `/files/contents?file=${encodeURIComponent(growthStatusPath(steamId))}`);
        const data = JSON.parse(await response.text());
        return json({
          ok: true,
          paused: Boolean(data.paused),
          growth: typeof data.growth === 'number' ? data.growth : null,
          updatedAt: data.updatedAt || null,
        });
      } catch {
        return json({ ok: true, paused: false, growth: null, updatedAt: null });
      }
    }

    // Inventory: attach one charge of a skin to ONE specific parked dino.
    // Pure file read-modify-write (no live pawn needed) — the skin bakes
    // into that snapshot's own data and applies once, at redeem time (see
    // tryRedeem in main.lua). This is what actually scopes a skin to a
    // single dino instead of leaking across every dino a player redeems.
    if (url.pathname === '/skin-attach-parked' && request.method === 'POST') {
      if (!env.PTERODACTYL_API_KEY || !env.PTERODACTYL_BASE_URL || !env.PTERODACTYL_SERVER_ID) {
        return json({ error: 'Bridge is not configured' }, 503);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { steamId, requesterSteamId, snapshotId, skinCode } = body || {};
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (requesterSteamId !== steamId) {
        return json({ error: 'Not the owner of this dino' }, 403);
      }
      if (typeof snapshotId !== 'number') {
        return json({ error: 'Missing or invalid snapshotId' }, 400);
      }
      if (typeof skinCode !== 'string' || skinCode === '') {
        return json({ error: 'Missing or invalid skinCode' }, 400);
      }
      try {
        const skins = await readSkinCharges(env, steamId);
        const skinEntry = skins.find((entry) => entry.code === skinCode);
        if (!skinEntry || (skinEntry.charges || 0) < 1) {
          return json({ error: 'No charges remaining for that skin' }, 400);
        }
        const dinos = await readParkedDinosArray(env, steamId);
        const dino = dinos.find((d) => d.capturedAt === snapshotId);
        if (!dino) return json({ error: 'Snapshot not found' }, 404);

        skinEntry.charges -= 1;
        const remainingSkins = skinEntry.charges > 0 ? skins : skins.filter((entry) => entry.code !== skinCode);
        dino.skin = { name: skinEntry.name, code: skinEntry.code, colors: skinEntry.colors };

        await writeSkinCharges(env, steamId, remainingSkins);
        await writeParkedDinosArray(env, steamId, dinos);
        return json({ ok: true, dino });
      } catch (error) {
        return json({ error: error.message || 'Skin attach failed' }, 502);
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

    // ── Friends (pure KV, no Pterodactyl — nothing here touches the game
    // server, same trust model as strikes: client-supplied steamId,
    // self-service actions only ever touch the caller's own records) ──

    if (url.pathname === '/friend-request' && request.method === 'POST') {
      if (!env.PARKED_KV) return json({ error: 'Bridge is not configured' }, 503);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { fromSteamId, toSteamId } = body || {};
      if (typeof fromSteamId !== 'string' || !/^\d{17}$/.test(fromSteamId)) {
        return json({ error: 'Missing or invalid fromSteamId' }, 400);
      }
      if (typeof toSteamId !== 'string' || !/^\d{17}$/.test(toSteamId)) {
        return json({ error: 'Missing or invalid toSteamId' }, 400);
      }
      if (fromSteamId === toSteamId) return json({ error: "You can't friend yourself" }, 400);

      try {
        const alreadyFriends = await env.PARKED_KV.get(`friends:${fromSteamId}:${toSteamId}`);
        if (alreadyFriends) return json({ error: 'Already friends' }, 400);
        const requestedAt = Date.now();
        await env.PARKED_KV.put(`friend_requests:${toSteamId}:${fromSteamId}`, JSON.stringify({ fromSteamId, toSteamId, requestedAt }));
        return json({ ok: true });
      } catch (error) {
        return json({ error: error.message || 'Friend request failed' }, 502);
      }
    }

    if (url.pathname === '/friend-accept' && request.method === 'POST') {
      if (!env.PARKED_KV) return json({ error: 'Bridge is not configured' }, 503);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { steamId, requesterSteamId } = body || {};
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (typeof requesterSteamId !== 'string' || !/^\d{17}$/.test(requesterSteamId)) {
        return json({ error: 'Missing or invalid requesterSteamId' }, 400);
      }
      try {
        const raw = await env.PARKED_KV.get(`friend_requests:${steamId}:${requesterSteamId}`);
        if (!raw) return json({ error: 'No pending request from that player' }, 404);
        await env.PARKED_KV.delete(`friend_requests:${steamId}:${requesterSteamId}`);
        const since = Date.now();
        await env.PARKED_KV.put(`friends:${steamId}:${requesterSteamId}`, JSON.stringify({ since }));
        await env.PARKED_KV.put(`friends:${requesterSteamId}:${steamId}`, JSON.stringify({ since }));
        return json({ ok: true });
      } catch (error) {
        return json({ error: error.message || 'Friend accept failed' }, 502);
      }
    }

    if (url.pathname === '/friend-decline' && request.method === 'POST') {
      if (!env.PARKED_KV) return json({ error: 'Bridge is not configured' }, 503);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { steamId, requesterSteamId } = body || {};
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (typeof requesterSteamId !== 'string' || !/^\d{17}$/.test(requesterSteamId)) {
        return json({ error: 'Missing or invalid requesterSteamId' }, 400);
      }
      try {
        await env.PARKED_KV.delete(`friend_requests:${steamId}:${requesterSteamId}`);
        return json({ ok: true });
      } catch (error) {
        return json({ error: error.message || 'Friend decline failed' }, 502);
      }
    }

    if (url.pathname === '/friend-remove' && request.method === 'POST') {
      if (!env.PARKED_KV) return json({ error: 'Bridge is not configured' }, 503);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { steamId, friendSteamId } = body || {};
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (typeof friendSteamId !== 'string' || !/^\d{17}$/.test(friendSteamId)) {
        return json({ error: 'Missing or invalid friendSteamId' }, 400);
      }
      try {
        await env.PARKED_KV.delete(`friends:${steamId}:${friendSteamId}`);
        await env.PARKED_KV.delete(`friends:${friendSteamId}:${steamId}`);
        return json({ ok: true });
      } catch (error) {
        return json({ error: error.message || 'Friend remove failed' }, 502);
      }
    }

    if (url.pathname === '/friends' && request.method === 'GET') {
      if (!env.PARKED_KV) return json({ ok: true, friends: [] });
      const steamId = url.searchParams.get('steamId');
      if (!steamId || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      try {
        const list = await env.PARKED_KV.list({ prefix: `friends:${steamId}:` });
        const friends = await Promise.all(
          list.keys.map(async (key) => {
            const friendSteamId = key.name.slice(`friends:${steamId}:`.length);
            const raw = await env.PARKED_KV.get(key.name);
            let since = null;
            try { since = JSON.parse(raw)?.since ?? null; } catch { /* ignore */ }
            return { steamId: friendSteamId, since };
          }),
        );
        return json({ ok: true, friends });
      } catch (error) {
        return json({ error: error.message || 'Friends lookup failed' }, 502);
      }
    }

    if (url.pathname === '/friend-requests' && request.method === 'GET') {
      if (!env.PARKED_KV) return json({ ok: true, requests: [] });
      const steamId = url.searchParams.get('steamId');
      if (!steamId || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      try {
        const list = await env.PARKED_KV.list({ prefix: `friend_requests:${steamId}:` });
        const requests = await Promise.all(
          list.keys.map(async (key) => {
            const raw = await env.PARKED_KV.get(key.name);
            try {
              return JSON.parse(raw);
            } catch {
              return null;
            }
          }),
        );
        return json({ ok: true, requests: requests.filter(Boolean) });
      } catch (error) {
        return json({ error: error.message || 'Friend requests lookup failed' }, 502);
      }
    }

    // ── Friend teleport requests ──

    if (url.pathname === '/teleport-request' && request.method === 'POST') {
      if (!env.PARKED_KV) return json({ error: 'Bridge is not configured' }, 503);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { fromSteamId, toSteamId, direction } = body || {};
      if (typeof fromSteamId !== 'string' || !/^\d{17}$/.test(fromSteamId)) {
        return json({ error: 'Missing or invalid fromSteamId' }, 400);
      }
      if (typeof toSteamId !== 'string' || !/^\d{17}$/.test(toSteamId)) {
        return json({ error: 'Missing or invalid toSteamId' }, 400);
      }
      if (direction !== 'requester_to_friend' && direction !== 'friend_to_requester') {
        return json({ error: 'Invalid direction' }, 400);
      }
      try {
        const areFriends = await env.PARKED_KV.get(`friends:${fromSteamId}:${toSteamId}`);
        if (!areFriends) return json({ error: 'Not friends with that player' }, 403);

        const cooldownKey = `teleport_cooldown:${fromSteamId}`;
        const onCooldown = await env.PARKED_KV.get(cooldownKey);
        if (onCooldown) return json({ error: 'Wait a bit before sending another teleport request' }, 429);

        await env.PARKED_KV.put(
          `teleport_requests:${toSteamId}:${fromSteamId}`,
          JSON.stringify({ fromSteamId, toSteamId, direction, requestedAt: Date.now() }),
        );
        // expirationTtl auto-clears the cooldown — no separate cleanup needed.
        await env.PARKED_KV.put(cooldownKey, '1', { expirationTtl: 60 });
        return json({ ok: true });
      } catch (error) {
        return json({ error: error.message || 'Teleport request failed' }, 502);
      }
    }

    if (url.pathname === '/teleport-accept' && request.method === 'POST') {
      if (!env.PTERODACTYL_API_KEY || !env.PTERODACTYL_BASE_URL || !env.PTERODACTYL_SERVER_ID || !env.PARKED_KV) {
        return json({ error: 'Bridge is not configured' }, 503);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { steamId, requesterSteamId } = body || {};
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (typeof requesterSteamId !== 'string' || !/^\d{17}$/.test(requesterSteamId)) {
        return json({ error: 'Missing or invalid requesterSteamId' }, 400);
      }
      try {
        const raw = await env.PARKED_KV.get(`teleport_requests:${steamId}:${requesterSteamId}`);
        if (!raw) return json({ error: 'No pending teleport request from that player' }, 404);
        const pending = JSON.parse(raw);
        await env.PARKED_KV.delete(`teleport_requests:${steamId}:${requesterSteamId}`);

        // requester_to_friend: the original requester (fromSteamId) moves.
        // friend_to_requester: the accepter (steamId, == toSteamId) moves.
        const moverSteamId = pending.direction === 'requester_to_friend' ? pending.fromSteamId : pending.toSteamId;
        const referenceSteamId = moverSteamId === pending.fromSteamId ? pending.toSteamId : pending.fromSteamId;

        await requestTeleportExecute(env, moverSteamId, referenceSteamId);
        return json({ ok: true });
      } catch (error) {
        return json({ error: error.message || 'Teleport accept failed' }, 502);
      }
    }

    if (url.pathname === '/teleport-decline' && request.method === 'POST') {
      if (!env.PARKED_KV) return json({ error: 'Bridge is not configured' }, 503);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }
      const { steamId, requesterSteamId } = body || {};
      if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      if (typeof requesterSteamId !== 'string' || !/^\d{17}$/.test(requesterSteamId)) {
        return json({ error: 'Missing or invalid requesterSteamId' }, 400);
      }
      try {
        await env.PARKED_KV.delete(`teleport_requests:${steamId}:${requesterSteamId}`);
        return json({ ok: true });
      } catch (error) {
        return json({ error: error.message || 'Teleport decline failed' }, 502);
      }
    }

    if (url.pathname === '/teleport-requests' && request.method === 'GET') {
      if (!env.PARKED_KV) return json({ ok: true, requests: [] });
      const steamId = url.searchParams.get('steamId');
      if (!steamId || !/^\d{17}$/.test(steamId)) {
        return json({ error: 'Missing or invalid steamId' }, 400);
      }
      try {
        const list = await env.PARKED_KV.list({ prefix: `teleport_requests:${steamId}:` });
        const requests = await Promise.all(
          list.keys.map(async (key) => {
            const raw = await env.PARKED_KV.get(key.name);
            try {
              return JSON.parse(raw);
            } catch {
              return null;
            }
          }),
        );
        return json({ ok: true, requests: requests.filter(Boolean) });
      } catch (error) {
        return json({ error: error.message || 'Teleport requests lookup failed' }, 502);
      }
    }

    // Admin-panel name-search autocomplete. Gated on the requester actually
    // holding an admin tier (unlike /admin-roster-public, which is meant to
    // be public) since this exposes every logged-in player's Steam name
    // alongside their steamId, not just the admin roster.
    if (url.pathname === '/player-directory' && request.method === 'GET') {
      if (!env.PARKED_KV) return json({ ok: true, players: [] });
      const requesterSteamId = url.searchParams.get('requesterSteamId');
      if (!requesterSteamId || !/^\d{17}$/.test(requesterSteamId)) {
        return json({ error: 'Missing or invalid requesterSteamId' }, 400);
      }
      const tier = await getAdminTier(env, requesterSteamId);
      if (!tier) return json({ error: 'Not an admin' }, 403);
      const raw = await env.PARKED_KV.get('player_directory:index');
      if (!raw) return json({ ok: true, players: [] });
      try {
        const { players } = JSON.parse(raw);
        const list = Object.entries(players || {}).map(([steamId, entry]) => ({
          steamId,
          name: entry.name,
          lastSeen: entry.lastSeen,
        }));
        return json({ ok: true, players: list });
      } catch {
        return json({ ok: true, players: [] });
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
      // Matches Game.ini's MaxPlayerCount=150 — RCON's PlayerList response
      // doesn't carry a server capacity figure, so this is hand-set rather
      // than read live; update if the server's player cap ever changes.
      return json({ uptime: null, active_mods: 0, players_online: players, max_players: 150 });
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
    ctx.waitUntil(
      syncPlayerDirectory(env).catch((error) => console.error('syncPlayerDirectory failed:', error.message)),
    );
  },
};
