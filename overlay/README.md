# LeveLs Desktop Overlay — Phase 1

Real pairing-code auth, plus the Map widget stacked beneath Live Dino.
Both windows fixed in place — top-left corner, same left edge, each 1/10
screen size. No drag/resize yet (Phase 2), no installer yet (Phase 3).

See the design memo for the full plan. Phase 0 (confirmed working against
a real Windows machine running Evrima) proved the core architecture —
this phase removes the Phase 0 limitation of a hardcoded Steam ID edited
directly into `main.js`.

## Setup

Requires [Node.js](https://nodejs.org) and must run on the Windows (or
other) machine you actually play Evrima on.

```
cd overlay
npm install
npm start
```

## First launch — pairing

On first run (no saved pairing yet), a small window opens asking for a
pairing code instead of the overlay windows:

1. On the website, go to **Profile** → **Desktop Overlay** → **Generate
   Pairing Code**.
2. Type that 6-character code into the overlay's pairing window.
3. Once connected, the pairing window closes and the Map + Live Dino
   windows appear, top-left, stacked.

The resulting token is saved locally (in Electron's own per-user app
data folder) — future launches skip pairing entirely and go straight to
the overlay windows. No Steam ID ever needs to be typed or edited by
hand anymore.

## What changed from Phase 0

- **Auth**: pairing-code flow instead of a hardcoded `TEST_STEAM_ID` in
  `main.js`. See the design memo's §05 for why this approach (not
  embedding Steam login inside Electron) was chosen.
- **Map widget**: new, stacked directly beneath Live Dino at the same
  left edge — shows your live position as a marker on the game map,
  polling the new token-authenticated `/api/overlay-positions` endpoint.
- Both windows still permanently click-through, still fixed position/
  size — that's still Phase 2.

## Known limitations (expected, not bugs)

- Fixed top-left position, fixed size — no dragging or resizing yet
  (Phase 2).
- Click-through is permanent — no edit-mode hotkey yet (Phase 2).
- Re-pairing required if the local config file is deleted, or if the
  overlay token is ever revoked server-side (not yet built — tokens
  currently last 90 days with no manual revoke path).
- Not packaged as an installer — runs via `npm start` from source only
  (Phase 3).

## If `npm start` fails with "Electron failed to install correctly"

This is a known, common Electron install issue — the `electron` npm
package downloads its actual ~150MB binary separately, and that download
step can get blocked by network/firewall/antivirus software without a
clear error. If `npm install` finishes but `npm start` still fails:

1. Confirm you can download `https://github.com/electron/electron/releases/download/v33.4.11/electron-v33.4.11-win32-x64.zip`
   directly in a browser. If that also fails, the problem is your
   network, not npm.
2. If the browser download works, manually extract that zip's contents
   directly into `overlay/node_modules/electron/dist/` (so
   `node_modules/electron/dist/electron.exe` exists directly, no extra
   nested folder), then create `overlay/node_modules/electron/path.txt`
   containing exactly `electron.exe` (no extra whitespace/newline).
