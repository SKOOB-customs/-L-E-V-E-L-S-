// Exchanges the short pairing code (generated on the website's Profile
// tab) for a long-lived overlay token. Hands the result back to main.js
// via the preload bridge — this renderer has no direct filesystem/IPC
// access of its own (contextIsolation, no nodeIntegration), only what
// preload-pair.js explicitly exposed.

const API_BASE = 'https://l-e-v-e-l-s.app';

const form = document.getElementById('pairForm');
const codeInput = document.getElementById('codeInput');
const submitBtn = document.getElementById('pairSubmit');
const statusEl = document.getElementById('pairStatus');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return;

  submitBtn.disabled = true;
  statusEl.classList.remove('is-success');
  statusEl.textContent = 'Connecting...';

  try {
    const response = await fetch(`${API_BASE}/api/overlay-pair-exchange?code=${encodeURIComponent(code)}`);
    const data = await response.json();
    if (!response.ok || !data.token) {
      statusEl.textContent = data.error || 'That code didn\'t work — try generating a new one.';
      submitBtn.disabled = false;
      return;
    }
    statusEl.classList.add('is-success');
    statusEl.textContent = 'Connected! Starting the overlay...';
    window.levelsOverlay.completePairing(data.token, data.steamId);
  } catch (error) {
    console.error('Pairing exchange failed:', error);
    statusEl.textContent = 'Could not reach the server — check your connection and try again.';
    submitBtn.disabled = false;
  }
});
