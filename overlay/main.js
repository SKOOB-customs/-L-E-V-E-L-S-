// LeveLs Desktop Overlay — Phase 0 proof of concept.
//
// See the design memo (shared separately) and overlay/README.md for the
// full picture. This phase deliberately does as little as possible:
// one fixed-position, fixed-size, always-on-top window showing Live
// Dino for ONE hardcoded Steam ID, permanently click-through, no drag/
// resize, no pairing-code auth yet. The only thing this phase exists to
// prove is whether an Electron always-on-top transparent window
// actually sits cleanly over Evrima in practice — everything else
// (Map widget, real auth, edit mode, packaging) is later phases, and
// none of it is worth building until this one is confirmed live.
//
// No real auth needed yet because functions/api/live-dino.js already
// accepts a bare ?steam_id= with no session cookie (confirmed — it sets
// Access-Control-Allow-Origin: '*' and never checks context.data), which
// happens to be exactly the "no auth" starting point this phase wants.

const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

// Replace with a real steamId64 to test against — whoever's actually
// spawned in-game while this runs. There's deliberately no config file
// or UI for this yet; Phase 1 replaces this whole constant with the
// pairing-code flow from the design memo.
const TEST_STEAM_ID = 'REPLACE_WITH_A_REAL_STEAMID64';

// 1/10 of screen size, per the design memo.
const OVERLAY_SCALE = 0.1;

function createLiveDinoWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const windowWidth = Math.round(screenWidth * OVERLAY_SCALE);
  const windowHeight = Math.round(screenHeight * OVERLAY_SCALE);

  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    resizable: false, // Phase 2 adds real resize via edit mode — fixed for now
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false, // never steals keyboard focus from the game
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 'screen-saver' is the level that actually stays above a fullscreen
  // game on Windows — the default always-on-top level gets covered by
  // most games' own fullscreen surface. This is the one thing Phase 0
  // exists to verify actually works against Evrima specifically; it's
  // expected to need the game running in Borderless Windowed rather
  // than true Fullscreen Exclusive, same limitation every overlay
  // (Discord included) has.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Permanently click-through in this phase — there's no edit mode yet
  // (that's Phase 2), so nothing here can ever intercept a click meant
  // for the game.
  win.setIgnoreMouseEvents(true);

  const url = new URL(`file://${path.join(__dirname, 'renderer', 'live-dino.html')}`);
  url.searchParams.set('steamId', TEST_STEAM_ID);
  win.loadURL(url.toString());

  return win;
}

app.whenReady().then(() => {
  createLiveDinoWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
