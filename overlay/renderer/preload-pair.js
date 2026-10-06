// Minimal contextBridge surface for the pairing window only — the Map
// and Live Dino windows need no Node/IPC access at all (they only ever
// do plain fetch() calls to the public API), so they have no preload
// script. This one exists solely so pair.js (a sandboxed renderer, no
// direct Node access) can hand the exchanged token back to main.js,
// which is the only process allowed to write the local config file.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('levelsOverlay', {
  completePairing: (token, steamId) => ipcRenderer.send('pairing-complete', { token, steamId }),
});
