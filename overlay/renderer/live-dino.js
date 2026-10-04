// LeveLs Desktop Overlay — Phase 0. Polls the live site's own public
// live-dino endpoint directly (no local backend, no bundled data) so
// this always shows real current state. No auth needed for this phase —
// functions/api/live-dino.js already accepts a bare ?steam_id= with no
// session cookie required, and is already CORS-open (Access-Control-
// Allow-Origin: '*'), which happens to be exactly the "nothing to wire
// up yet" starting point this phase wants. Phase 1 replaces this with
// the pairing-code token flow from the design memo.

const params = new URLSearchParams(window.location.search);
const steamId = params.get('steamId');

const POLL_MS = 2000; // matches the website's own Live Dino poll interval
const STATS = ['growth', 'health', 'stamina', 'hunger', 'thirst'];
const API_BASE = 'https://l-e-v-e-l-s.app';

// Mirrors bridge-worker.js's own speciesFromClassPath — the RCON class
// field comes back as a full engine path
// (/Game/.../Dinosaurs/Tyrannosaurus/BP_Tyrannosaurus.BP_Tyrannosaurus_C),
// not a plain species name.
const speciesFromClassPath = (classPath) => {
  const match = /\/Dinosaurs\/([^/]+)\//.exec(classPath || '');
  return match ? match[1] : (classPath || '—');
};

const render = (data) => {
  const card = document.getElementById('dinoCard');
  const dot = document.getElementById('statusDot');
  const statsEl = document.getElementById('dinoStats');

  if (!data.found) {
    card.classList.add('is-empty');
    dot.style.background = '#8a7d61';
    document.getElementById('dinoClass').textContent = '—';
    document.getElementById('dinoName').textContent = '';
    statsEl.innerHTML = '';
    return;
  }

  card.classList.remove('is-empty');
  dot.style.background = '#7ad694';
  document.getElementById('dinoClass').textContent = speciesFromClassPath(data.class);
  document.getElementById('dinoName').textContent = data.name || '';

  statsEl.innerHTML = '';
  STATS.forEach((stat) => {
    const pct = Math.round((data[stat] || 0) * 100);
    const row = document.createElement('div');
    row.className = 'stat-row';

    const label = document.createElement('span');
    label.className = 'stat-label';
    label.textContent = stat;

    const track = document.createElement('div');
    track.className = 'stat-track';
    const fill = document.createElement('div');
    fill.className = `stat-fill stat-${stat}`;
    fill.style.width = `${pct}%`;
    track.appendChild(fill);

    const value = document.createElement('span');
    value.className = 'stat-value';
    value.textContent = `${pct}%`;

    row.append(label, track, value);
    statsEl.appendChild(row);
  });
};

const pollLiveDino = async () => {
  if (!steamId) return;
  try {
    const response = await fetch(`${API_BASE}/api/live-dino?steam_id=${encodeURIComponent(steamId)}`);
    const data = await response.json();
    render(data);
  } catch (error) {
    console.error('Live dino poll failed:', error);
  }
};

pollLiveDino();
setInterval(pollLiveDino, POLL_MS);
