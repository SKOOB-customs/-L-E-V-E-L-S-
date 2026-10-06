// LeveLs Desktop Overlay — Map widget (Phase 1). Polls the authenticated
// /api/overlay-positions endpoint (token-based, since this standalone
// Electron process has no browser session cookie) and places a marker
// for the paired player's own live position.
//
// Calibration constants mirror script.js's own worldToMapFraction and
// MAP_MARKER_OFFSET_X_PCT/Y_PCT exactly (same Vulnona-sourced world
// bounds, same small registration offset tuned against the live map
// artwork) — duplicated here rather than shared as a module, since the
// overlay is a separate small app, not bundled with the site's own JS.
// Keep these in sync if the website's own calibration ever changes.

const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const steamId = params.get('steamId');

const POLL_MS = 2000;
const API_BASE = 'https://l-e-v-e-l-s.app';

const MAP_MIN_X = -607;
const MAP_MAX_X = 509;
const MAP_MIN_Y = -505;
const MAP_MAX_Y = 607;
const MAP_MARKER_OFFSET_X_PCT = 3;
const MAP_MARKER_OFFSET_Y_PCT = 2;

const worldToMapFraction = (worldX, worldY) => {
  const sx = worldX / 1000;
  const sy = worldY / 1000;
  const fx = (sx - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X);
  const fy = (sy - MAP_MIN_Y) / (MAP_MAX_Y - MAP_MIN_Y);
  return { fx, fy };
};

const pollPosition = async () => {
  if (!token || !steamId) return;
  const marker = document.getElementById('mapMarker');
  try {
    const response = await fetch(`${API_BASE}/api/overlay-positions?token=${encodeURIComponent(token)}`);
    const data = await response.json();
    if (!response.ok || !data.players) {
      marker.hidden = true;
      return;
    }
    const location = data.players[steamId]?.location;
    if (!location) {
      marker.hidden = true;
      return;
    }
    const { fx, fy } = worldToMapFraction(location.x, location.y);
    marker.hidden = false;
    marker.style.left = `${Math.min(100, Math.max(0, fx * 100 + MAP_MARKER_OFFSET_X_PCT))}%`;
    marker.style.top = `${Math.min(100, Math.max(0, fy * 100 + MAP_MARKER_OFFSET_Y_PCT))}%`;
  } catch (error) {
    console.error('Map position poll failed:', error);
  }
};

pollPosition();
setInterval(pollPosition, POLL_MS);
