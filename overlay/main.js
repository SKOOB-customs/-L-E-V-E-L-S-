// LeveLs Desktop Overlay — Phase 1.
//
// Phase 0 proved an Electron always-on-top transparent window sits
// cleanly over Evrima. This phase adds real auth (the pairing-code flow
// from the design memo, replacing Phase 0's hardcoded TEST_STEAM_ID) and
// the Map widget, stacked beneath it — both anchored to the same
// top-left corner, each 1/10 screen size, per the locked-in design.
//
// Still no edit mode (drag/resize) — that's Phase 2. Both windows stay
// permanently click-through and fixed in place.

const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const OVERLAY_SCALE = 0.1; // 1/10 of screen size, per the design memo
const CONFIG_PATH = path.join(app.getPath('userData'), 'overlay-config.json');

const loadConfig = () => {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);
    return config?.token && config?.steamId ? config : null;
  } catch {
    return null; // no config yet, or it's corrupt — either way, re-pair
  }
};

const saveConfig = (config) => {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config), 'utf-8');
};

let pairWindow = null;
let mapWindow = null;
let liveDinoWindow = null;

// Shared by both the Map and Live Dino windows — same always-on-top/
// click-through/fixed-size setup, just a different loaded page and a
// different vertical offset for stacking.
const createOverlayWindow = (htmlFile, queryParams, top) => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const windowWidth = Math.round(screenWidth * OVERLAY_SCALE);
  const windowHeight = Math.round(screenHeight * OVERLAY_SCALE);

  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: 0,
    y: top,
    frame: false,
    transparent: true,
    resizable: false, // Phase 2 adds real resize via edit mode
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false, // never steals keyboard focus from the game
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 'screen-saver' is the level that stays above a fullscreen game on
  // Windows — confirmed working against Evrima in Phase 0.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true); // permanently click-through in this phase

  const url = new URL(`file://${path.join(__dirname, 'renderer', htmlFile)}`);
  Object.entries(queryParams).forEach(([key, value]) => url.searchParams.set(key, value));
  win.loadURL(url.toString());

  return win;
};

const launchMainWindows = (config) => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { height: screenHeight } = primaryDisplay.workAreaSize;
  const windowHeight = Math.round(screenHeight * OVERLAY_SCALE);

  // Stacked, same left edge: Map first (top-left corner), Live Dino
  // directly beneath it — the default layout locked in for this phase.
  mapWindow = createOverlayWindow('map.html', { token: config.token, steamId: config.steamId }, 0);
  liveDinoWindow = createOverlayWindow('live-dino.html', { steamId: config.steamId }, windowHeight);
};

const createPairWindow = () => {
  pairWindow = new BrowserWindow({
    width: 420,
    height: 300,
    resizable: false,
    title: 'LeveLs Overlay — Connect',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'renderer', 'preload-pair.js'),
    },
  });
  pairWindow.setMenuBarVisibility(false);
  pairWindow.loadFile(path.join(__dirname, 'renderer', 'pair.html'));
};

// Sent by pair.js (via preload-pair.js's contextBridge) once it's
// successfully exchanged a pairing code for a token — this main process
// is the only one allowed to touch the filesystem, so the renderer hands
// the result back here rather than writing the config itself.
ipcMain.on('pairing-complete', (event, { token, steamId }) => {
  saveConfig({ token, steamId });
  if (pairWindow) {
    pairWindow.close();
    pairWindow = null;
  }
  launchMainWindows({ token, steamId });
});

app.whenReady().then(() => {
  const config = loadConfig();
  if (config) {
    launchMainWindows(config);
  } else {
    createPairWindow();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
