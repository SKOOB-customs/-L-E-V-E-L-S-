# Ashburn server info (snapshot before relocation)

Pulled live from the Bropanel (Game Host Bros) Client API on 2026-09-13,
ahead of moving the server to a new location/node — the IP, node, and
backups below are tied to this specific node and will be gone once the
move happens.

## Server identity

- Name: `[NA] L-e-v-e-l-s | 3x Growth | Survival/PvP |`
- Pterodactyl server identifier: `db5c10f0`
- Server UUID: `db5c10f0-f841-4e28-b316-2604959ad846`
- Node: `us-ash-09-018`
- Location: Ashburn, VA

## Network

- Game IP: `168.100.160.159`
  - Port `27056` — default/game port
  - Port `27057` — RCON port
  - Port `27058` — additional allocation
- SFTP host: `us-ash-09-018.myserverfiles.com`, port `2022`
  (SFTP password not stored here — see note below)

## Backups at time of snapshot

Automatic daily backups, 4 of 20 automatic slots used (5 manual slots also
available, 0 used):

| Date       | UUID                                   | Size    | Status |
|------------|-----------------------------------------|---------|--------|
| 2026-09-13 | `df95af04-4975-4073-807c-46252ab4d9b6` | 2.51 GB | ok |
| 2026-09-12 | `30b7f399-f4e6-4af4-b937-a5b1dbfe9061` | 2.51 GB | ok |
| 2026-09-11 | `08adc017-d194-4fe6-be87-a0c5439b3c2b` | 2.50 GB | ok |
| 2026-09-10 | `84f40c44-cfa2-4403-9525-a81e86705e2e` | 2.49 GB | ok |

These backups live on Bropanel's storage for this node — if the move to a
new location deletes/recreates the server instance, download any of these
you want to keep from the panel's Backups tab **before** the move happens,
since they won't carry over automatically.

## Not stored here (public repo — do not commit credentials)

The RCON password and SFTP password are per-node secrets. They were shown
live in chat when this snapshot was taken; store them yourself in a
password manager if you want to keep a copy. `wrangler.jsonc`'s
`RCON_HOST` var will need to be updated to the new IP after the move
(`RCON_PASSWORD`/`PTERODACTYL_API_KEY` are Cloudflare secrets and may also
need updating depending on what the new node/panel assigns).
