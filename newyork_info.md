# New York server info (current, post-relocation)

Pulled live from the Bropanel (Game Host Bros) Client API on 2026-09-14
after the move off Ashburn (see `ashburn_info.md` for that snapshot).

## Server identity

- Name: `[NA] L-e-v-e-l-s | 3x Growth | Survival/PvP |`
- Pterodactyl server identifier: `db5c10f0` (unchanged — same server record,
  just transferred to a new node)
- Node: `us-nyc-02-001`
- Location: New York

## Network

- Game IP: `208.115.234.226`
  - Port `27038` — default/game port (what players connect to)
  - Port `27039` — RCON port
  - Port `27040` — additional allocation
- RCON password unchanged from Ashburn (`9jOe2Pej` — not stored here, see
  the note in `ashburn_info.md` about why credentials don't go in this
  public repo)

## What changed in the site's own config after this move

- `wrangler.jsonc`'s `RCON_HOST` var: `168.100.160.159` → `208.115.234.226`
- Cloudflare Worker secret `RCON_PORT`: → `27039`
- `RCON_PASSWORD` secret: unchanged (same password carried over)
- `PTERODACTYL_BASE_URL`/`PTERODACTYL_SERVER_ID`: unchanged — same
  Bropanel panel and same server identifier, only the node moved

## Backups

Confirmed via the API right after the move: the new node shows **0**
automatic and 0 manual backups — Ashburn's backups did **not** carry over
with the transfer. If any of the Ashburn backups (see `ashburn_info.md`)
weren't downloaded before the move, they're gone. Automatic daily backups
will start accumulating fresh from here.
