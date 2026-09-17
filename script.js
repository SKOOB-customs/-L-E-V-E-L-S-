// Splash (index.html's #splashOverlay) shows on every real page load and
// self-dismisses via a pure CSS animation (styles.css) — this just picks
// which admin/owner line to show, set as early as possible so it's there
// before the overlay's fade-out even starts. Not tied to a specific
// admin's real activity, just flavor text. Split into name/rest (instead
// of one flat string) so the name specifically can get its own glow
// styling (.splash-name) without the rest of the sentence.
const SPLASH_MESSAGES = [
  { name: 'Skoob', rest: 'is cooking up some heat in the skin lab.' },
  { name: 'Bart', rest: 'is cooking up a new Rex tech.' },
  { name: 'WebMasta', rest: 'is aerialing his way to the RL champs.' },
  { name: 'PapaT', rest: 'is making crazy fire patterns for skins again.' },
  { name: 'WoahNelli', rest: 'is creating vibes for the community.' },
  { name: 'Evil', rest: 'is sniffing out the next competent Rex.' },
  { name: 'Yaowa', rest: 'is dibbling around until his Rex needs to be called in.' },
  { name: 'Honey', rest: 'is learning another dino to torment Prammy on.' },
  { name: 'Prammy', rest: 'is nesting an army to mess with Honey.' },
  { name: 'Mint', rest: 'has wandered into her own art again — send snacks, not search parties.' },
  { name: 'Ubbe', rest: 'is adding a feature while getting cooked on Rex by Soulz.' },
];
// Ubbe and Skoob get an extra shimmer/sparkle on top of the shared glow
// every name has (.splash-name-sparkle) — everyone else just gets the
// base .splash-name treatment.
const SPARKLE_NAMES = new Set(['Ubbe', 'Skoob']);
const splashMessageEl = document.querySelector('[data-splash-message]');
if (splashMessageEl) {
  const pick = SPLASH_MESSAGES[Math.floor(Math.random() * SPLASH_MESSAGES.length)];
  const nameEl = document.createElement('span');
  nameEl.className = SPARKLE_NAMES.has(pick.name) ? 'splash-name splash-name-sparkle' : 'splash-name';
  nameEl.textContent = pick.name;
  splashMessageEl.append(nameEl, ` ${pick.rest}`);
}

const toast = document.getElementById('toast');
let toastTimer = null;

const discordMemberStorageKey = 'levelsDiscordMemberCount';
const skinPackCountStorageKey = 'levelsSkinPackCount';
const serverIdStorageKey = 'levelsServerConfigId';
const serverUptimeStorageKey = 'levelsServerUptime';
const serverPlayersStorageKey = 'levelsServerPlayers';

const getDiscordMemberCount = () => {
  const saved = Number.parseInt(localStorage.getItem(discordMemberStorageKey) || '0', 10);
  return Number.isFinite(saved) && saved >= 0 ? saved : 0;
};

const setDiscordMemberCount = (count) => {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  localStorage.setItem(discordMemberStorageKey, String(safeCount));

  document.querySelectorAll('[data-discord-count]').forEach((element) => {
    element.textContent = safeCount.toLocaleString();
  });
};

const getSkinPackCount = () => {
  const saved = Number.parseInt(localStorage.getItem(skinPackCountStorageKey) || '10', 10);
  return Number.isFinite(saved) && saved >= 0 ? saved : 10;
};

const setSkinPackCount = (count) => {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 10;
  localStorage.setItem(skinPackCountStorageKey, String(safeCount));

  document.querySelectorAll('[data-skin-count]').forEach((element) => {
    element.textContent = safeCount.toLocaleString();
  });
};

const getServerConfigId = () => {
  return localStorage.getItem(serverIdStorageKey) || 'levels-main';
};

const updateServerPlayers = (players, maxPlayers) => {
  const display = `${Math.max(0, Math.floor(players))} / ${Math.max(0, Math.floor(maxPlayers))}`;
  document.querySelectorAll('[data-server-players]').forEach((element) => {
    element.textContent = display;
  });
  localStorage.setItem(serverPlayersStorageKey, display);
};

const setServerConfigId = (id) => {
  if (id) {
    localStorage.setItem(serverIdStorageKey, id);
  } else {
    localStorage.removeItem(serverIdStorageKey);
  }
};

const updateActiveModsCount = (count) => {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  document.querySelectorAll('[data-active-mods]').forEach((element) => {
    element.textContent = safeCount.toLocaleString();
  });
};

const updateServerUptime = (uptime) => {
  const displayText = typeof uptime === 'number' ? `${uptime.toFixed(1)}%` : uptime || '--';
  document.querySelectorAll('[data-server-uptime]').forEach((element) => {
    element.textContent = displayText;
  });
  if (typeof uptime === 'number') {
    localStorage.setItem(serverUptimeStorageKey, String(uptime));
  }
};

const showToast = (message) => {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
};

// Shrinks an element's font-size just enough for its own text to stop
// clipping against its box (e.g. a long Steam display name in the fixed-
// height header button) — resets to the CSS default first so a shorter
// name later doesn't stay stuck at a previously-shrunk size.
const fitTextToBox = (el, { minFontPx = 11, step = 1 } = {}) => {
  if (!el) return;
  el.style.fontSize = '';
  let fontPx = Number.parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth && fontPx > minFontPx) {
    fontPx -= step;
    el.style.fontSize = `${fontPx}px`;
  }
};

const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

const activateTab = (tabName) => {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle('active', isActive);
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tab === tabName;
    panel.classList.toggle('is-active', isActive);
    panel.style.display = isActive ? 'grid' : 'none';
  });

  // Persists the active tab into the URL hash so a plain page reload
  // restores whatever page you were actually on (see the bootstrap
  // below), instead of always dropping back to Home — a real reported
  // case: reloading kept landing somewhere unrelated to what was being
  // viewed, since nothing synced the hash on ordinary tab switches
  // before this (only a couple of special-cased flows, like clicking the
  // header username, ever touched it). Skipped while the hash still
  // carries unconsumed OAuth redirect params (e.g.
  // "#profile?steam_id=...&steam_name=...") — consumeSteamRedirect()
  // (called later at module load) needs to read those first, and
  // overwriting the hash here would destroy them before it gets the
  // chance.
  if (!window.location.hash.includes('?')) {
    try {
      history.replaceState(null, '', `${window.location.pathname}#${tabName}`);
    } catch {
      // ignore — worst case this one tab switch doesn't persist
    }
  }
};

if (tabButtons.length) {
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activateTab(button.dataset.tab);
    });
  });

  const hashTab = window.location.hash.replace('#', '').split('?')[0];
  // Checked against every real tab-panel, not just ones with a visible
  // button — Profile (reached via the header username, no top-bar button
  // of its own) is still a real page that should survive a reload too.
  const hasHashTab = [...tabPanels].some((panel) => panel.dataset.tab === hashTab);
  // "hub" (not "gallery") is the landing view on every plain load/refresh —
  // the hash special-case (set by the Steam-login redirect flow below, e.g.
  // #profile) still takes priority when present.
  activateTab(hasHashTab ? hashTab : 'hub');
}

// ── Home hub: a customizable, drag-reorderable grid of every real page on
// the site, shown first on every load. Order is a pure per-browser
// preference (not gameplay data), so it's just localStorage — no need to
// round-trip it through any backend.
const HUB_ORDER_STORAGE_KEY = 'levelsHubOrder';

const HUB_PAGES = [
  { tab: 'overview', icon: 'OV', title: 'Overview', desc: 'Server status, stats, and how to find us in-game.' },
  { tab: 'gallery', icon: 'SS', title: 'Slideshow', desc: 'Screenshots and community highlights.' },
  { tab: 'live-dino', icon: 'LD', title: 'Live Dino', desc: 'Track your current dino, pause growth, park it.' },
  { tab: 'inventory', icon: 'IN', title: 'Inventory', desc: 'Parked dinos, mutations, and glitch skins.' },
  { tab: 'friends', icon: 'FR', title: 'Friends', desc: 'Add friends and request a teleport meet-up.' },
  { tab: 'skins', icon: 'SK', title: 'Skins', desc: 'Glitch skin packs and how to submit your own.' },
  { tab: 'map', icon: 'MP', title: 'Map', desc: 'Live server map with your dino tracked on it.' },
  { tab: 'community', icon: 'CM', title: 'Community', desc: 'Staff roster and Discord.' },
  { tab: 'features', icon: 'FT', title: 'Features', desc: 'What the community can build here.' },
  { tab: 'submit', icon: 'SB', title: 'Submit', desc: 'Share a feature idea or vote on one.' },
  { tab: 'tickets', icon: 'TK', title: 'Support', desc: 'Submit a ticket straight to staff in Discord.' },
];

const loadHubOrder = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(HUB_ORDER_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const saveHubOrder = () => {
  const order = [...document.querySelectorAll('[data-hub-card]')].map((card) => card.dataset.hubCard);
  try {
    localStorage.setItem(HUB_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch (error) {
    console.debug('Saving hub order failed:', error);
  }
};

const buildHubCard = (page) => {
  const card = document.createElement('article');
  card.className = 'hub-card panel';
  card.dataset.hubCard = page.tab;

  const top = document.createElement('div');
  top.className = 'hub-card-top';

  const icon = document.createElement('span');
  icon.className = 'hub-card-icon';
  icon.textContent = page.icon;

  const controls = document.createElement('div');
  controls.className = 'hub-card-controls';

  const moveLeft = document.createElement('button');
  moveLeft.type = 'button';
  moveLeft.className = 'hub-card-move';
  moveLeft.textContent = '‹';
  moveLeft.setAttribute('aria-label', `Move ${page.title} earlier`);
  moveLeft.addEventListener('click', (event) => {
    event.stopPropagation();
    const prev = card.previousElementSibling;
    if (prev) {
      card.parentElement.insertBefore(card, prev);
      saveHubOrder();
    }
  });

  const moveRight = document.createElement('button');
  moveRight.type = 'button';
  moveRight.className = 'hub-card-move';
  moveRight.textContent = '›';
  moveRight.setAttribute('aria-label', `Move ${page.title} later`);
  moveRight.addEventListener('click', (event) => {
    event.stopPropagation();
    const next = card.nextElementSibling;
    if (next) {
      card.parentElement.insertBefore(next, card);
      saveHubOrder();
    }
  });

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'hub-card-handle';
  handle.textContent = '⠿';
  handle.setAttribute('aria-label', `Drag to reorder ${page.title}`);
  handle.addEventListener('click', (event) => event.stopPropagation());

  controls.append(moveLeft, handle, moveRight);
  top.append(icon, controls);

  const title = document.createElement('h3');
  title.textContent = page.title;

  const desc = document.createElement('p');
  desc.textContent = page.desc;

  card.append(top, title, desc);
  // Clicks the REAL tab button rather than calling activateTab(page.tab)
  // directly — several tabs (Inventory, Community) load their data from a
  // listener bound to the button's own click event, not from activateTab
  // itself, so bypassing the button would land on an empty/stale tab.
  // Friends has no tab button at all anymore (it's the slide-out sidebar),
  // so its card opens that instead.
  card.addEventListener('click', () => {
    if (page.tab === 'friends') {
      openFriends();
      return;
    }
    document.querySelector(`.tab-button[data-tab="${page.tab}"]`)?.click();
  });

  // Pointer events (not native HTML5 drag-and-drop) so this works on touch
  // as well as mouse — a real requirement for a game community site.
  //
  // The dragged card is pulled out of grid flow and becomes an absolutely-
  // positioned overlay that tracks the cursor 1:1 (smooth, real drag-follow
  // feedback), while a same-sized placeholder holds its spot in the grid
  // and hops to wherever the cursor is hovering, so the rest of the grid
  // reflows around it live. An earlier version moved the actual card
  // element on every hover instead of a placeholder, with no cursor-follow
  // visual at all — just an instant, jarring swap the moment the pointer
  // crossed into a neighboring card's box. This is the standard technique
  // most drag-reorder libraries use internally; no library needed for
  // something this small.
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);

    const grid = card.parentElement;
    const rect = card.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const placeholder = document.createElement('div');
    placeholder.className = 'hub-card-placeholder';
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    card.after(placeholder);

    card.classList.add('is-dragging');
    card.style.width = `${rect.width}px`;
    card.style.left = `${rect.left - gridRect.left}px`;
    card.style.top = `${rect.top - gridRect.top}px`;

    const onMove = (moveEvent) => {
      card.style.left = `${moveEvent.clientX - gridRect.left - offsetX}px`;
      card.style.top = `${moveEvent.clientY - gridRect.top - offsetY}px`;

      const target = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest('.hub-card-placeholder, .hub-card:not(.is-dragging)');
      if (!target || target === placeholder || target.parentElement !== grid) return;
      const siblings = [...grid.children];
      if (siblings.indexOf(placeholder) < siblings.indexOf(target)) {
        target.after(placeholder);
      } else {
        target.before(placeholder);
      }
    };

    const onUp = () => {
      try { handle.releasePointerCapture(pointerId); } catch { /* already released */ }
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);

      placeholder.replaceWith(card);
      card.classList.remove('is-dragging');
      card.style.width = '';
      card.style.left = '';
      card.style.top = '';
      saveHubOrder();
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });

  return card;
};

const renderHub = () => {
  const grid = document.querySelector('[data-hub-grid]');
  if (!grid) return;

  // Admin Panel only ever shows up here once checkAdminPanelAccess has
  // actually revealed the real tab button for this signed-in admin — a
  // hub card linking to a hidden tab would be a dead click.
  const adminButtonVisible = !document.querySelector('.admin-panel-tab-button')?.hidden;
  const availablePages = HUB_PAGES.concat(
    adminButtonVisible
      ? [{ tab: 'admin-panel', icon: 'AD', title: 'Admin Panel', desc: 'Compensation, strikes, and glitch skins.' }]
      : [],
  );

  const savedOrder = loadHubOrder();
  const byTab = new Map(availablePages.map((page) => [page.tab, page]));
  const ordered = [
    ...savedOrder.map((tab) => byTab.get(tab)).filter(Boolean),
    ...availablePages.filter((page) => !savedOrder.includes(page.tab)),
  ];

  grid.innerHTML = '';
  ordered.forEach((page) => grid.appendChild(buildHubCard(page)));
};

renderHub();

document.getElementById('headerSteamBtn')?.addEventListener('click', (event) => {
  if (!getSteamProfile()) return; // not logged in yet, let the link go to /api/steam-login
  event.preventDefault();
  activateTab('profile');
  history.replaceState(null, '', `${window.location.pathname}#profile`);
});

document.querySelector('.profile-access')?.addEventListener('click', () => {
  activateTab('profile');
  history.replaceState(null, '', `${window.location.pathname}#profile`);
});

const galleryItems = [...document.querySelectorAll('.gallery-item')];
const galleryCounter = document.querySelector('.gallery-counter');
let galleryIndex = 0;

const showGalleryItem = (index) => {
  if (!galleryItems.length) return;
  galleryIndex = (index + galleryItems.length) % galleryItems.length;
  galleryItems.forEach((item, itemIndex) => {
    item.classList.toggle('is-current', itemIndex === galleryIndex);
  });
  if (galleryCounter) galleryCounter.textContent = `${galleryIndex + 1} of ${galleryItems.length}`;
};

document.querySelector('.gallery-previous')?.addEventListener('click', () => showGalleryItem(galleryIndex - 1));
document.querySelector('.gallery-next')?.addEventListener('click', () => showGalleryItem(galleryIndex + 1));
showGalleryItem(0);

const initialDiscordCount = getDiscordMemberCount();
setDiscordMemberCount(initialDiscordCount);

const submitButton = document.querySelector('#submit .action-button');
if (submitButton) {
  submitButton.addEventListener('click', (event) => {
    event.preventDefault();
    showToast('Submission queued for review.');
  });
}

const secondaryButtons = document.querySelectorAll('.secondary-button, .ghost-link');
secondaryButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    const href = button.getAttribute('href');
    if (href && href.startsWith('#')) {
      event.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });
});

// Steam Profile & Staff Permission Management
const steamStorageKey = 'levelsSteamProfile';
const discordStorageKey = 'levelsDiscordProfile';
const staffStorageKey = 'levelsStaffList';

const defaultStaffList = [
  { steamId: '76561199769378102', username: 'Owner', role: 'Owner' },
];

const getStaffList = () => {
  try {
    const saved = localStorage.getItem(staffStorageKey);
    const staffList = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(staffList)) return defaultStaffList;

    defaultStaffList.forEach((defaultMember) => {
      if (!staffList.some((member) => member.steamId === defaultMember.steamId)) {
        staffList.push(defaultMember);
      }
    });
    return staffList;
  } catch {
    return defaultStaffList;
  }
};

const saveStaffList = (list) => {
  localStorage.setItem(staffStorageKey, JSON.stringify(list));
  renderStaffRoster();
};

const getSteamProfile = () => {
  const saved = localStorage.getItem(steamStorageKey);
  return saved ? JSON.parse(saved) : null;
};

const setSteamProfile = (steamId, username, staffRole = '') => {
  const profile = { steamId, username, staffRole, connectedAt: new Date().toISOString() };
  localStorage.setItem(steamStorageKey, JSON.stringify(profile));
  return profile;
};

// One-time migration check: every player who was already "signed in"
// (this localStorage profile) before the site switched from trusting a
// client-supplied steamId to a real signed session cookie has no such
// cookie yet, and every write action would otherwise start failing with
// a confusing "please sign in again" error while the header still shows
// them as logged in. Runs once per load and forces a clean client-side
// logout + reload the moment it detects that mismatch, so they land on
// the normal signed-out page and know to log back in, rather than
// discovering it action-by-action.
(async () => {
  if (!getSteamProfile()?.steamId) return;
  try {
    const response = await fetch('/api/session-status');
    const data = await response.json();
    if (!data.authed) {
      localStorage.removeItem(steamStorageKey);
      if (data.banned) {
        // A ban mid-session (as opposed to the stale-cookie case this
        // check was originally built for) — a plain reload would clear
        // the toast before it's readable, so this gives it a moment.
        showToast('You have been banned from LeveLs.');
        setTimeout(() => window.location.reload(), 1800);
      } else {
        window.location.reload();
      }
    }
  } catch (error) {
    console.debug('Session status check failed:', error);
  }
})();

const getDiscordProfile = () => {
  try {
    const saved = localStorage.getItem(discordStorageKey);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

const setDiscordProfile = (discordId, username, staffRole) => {
  const profile = { discordId, username, staffRole, connectedAt: new Date().toISOString() };
  localStorage.setItem(discordStorageKey, JSON.stringify(profile));
  return profile;
};

// Clears both accounts, not just Steam — a real reported case: logging
// out and back in with Steam alone still showed Discord as connected,
// since Discord's login is entirely separate client-side state with no
// cookie tied to the Steam session at all. /api/logout clears the two
// HttpOnly cookies (session + admin-unlock) that JS can't touch directly;
// everything else is local to this browser.
const logoutPlayer = async () => {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (error) {
    console.debug('Logout request failed:', error);
  }
  localStorage.removeItem(steamStorageKey);
  localStorage.removeItem(discordStorageKey);
  window.location.reload();
};

document.getElementById('logoutBtn')?.addEventListener('click', logoutPlayer);

const roleDetailsMap = {
  Owner: { badge: '👑 Owner', perms: ['admin', 'cheat', 'kick', 'ban', 'teleport', 'spawn', 'manage_permissions'] },
  Admin: { badge: '🛡️ Admin', perms: ['admin', 'cheat', 'kick', 'ban', 'teleport', 'spawn'] },
  Moderator: { badge: '⚔️ Moderator', perms: ['kick', 'ban', 'teleport', 'mute'] },
  Staff: { badge: '⭐ Staff', perms: ['teleport', 'kick', 'mute'] },
  Player: { badge: '🎮 Player', perms: [] },
};

const staffRoleRank = { Player: 0, Staff: 1, Moderator: 2, Admin: 3, Owner: 4 };
let currentStaffRole = 'Player';

const hasDevToolsAccess = () => (staffRoleRank[currentStaffRole] || 0) >= staffRoleRank.Admin;

const updateStaffArea = (role = 'Player') => {
  const rank = staffRoleRank[role] || 0;
  const staffTabButton = document.querySelector('.staff-tab-button');
  const devToolsTabButton = document.querySelector('.dev-tools-tab-button');
  const staffWorkspace = document.getElementById('staffWorkspace');
  const staffAccessNotice = document.getElementById('staffAccessNotice');
  const devToolsPanel = document.getElementById('dev-tools');
  const ticketWorkspace = document.getElementById('ticketWorkspace');
  const staffAreaRole = document.getElementById('staffAreaRole');
  const staffAreaTitle = document.getElementById('staffAreaTitle');
  const staffAreaDescription = document.getElementById('staffAreaDescription');

  const hasStaffAccess = rank >= staffRoleRank.Moderator;
  const canUseDevTools = rank >= staffRoleRank.Admin;
  currentStaffRole = role;
  if (staffTabButton) staffTabButton.hidden = !hasStaffAccess;
  if (devToolsTabButton) devToolsTabButton.hidden = !canUseDevTools;
  if (staffWorkspace) staffWorkspace.hidden = !hasStaffAccess;
  if (staffAccessNotice) staffAccessNotice.hidden = hasStaffAccess;
  if (devToolsPanel) devToolsPanel.hidden = !canUseDevTools;
  if (ticketWorkspace) ticketWorkspace.hidden = !canUseDevTools;

  document.querySelectorAll('[data-staff-level]').forEach((tool) => {
    tool.hidden = rank < staffRoleRank[tool.dataset.staffLevel];
  });

  if (!hasStaffAccess) return;

  const descriptions = {
    Moderator: 'You can handle player reports and moderation notes.',
    Admin: 'You have Moderator tools plus server operations controls.',
    Owner: 'You have every staff role and full team access.',
  };
  if (staffAreaRole) staffAreaRole.textContent = role;
  if (staffAreaTitle) staffAreaTitle.textContent = `${role} access`;
  if (staffAreaDescription) staffAreaDescription.textContent = descriptions[role];
};

const renderStaffRoster = () => {
  const rosterDiv = document.getElementById('staffRosterList');
  if (!rosterDiv) return;

  const staffList = getStaffList();
  if (staffList.length === 0) {
    rosterDiv.innerHTML = '<p style="font-size: 0.9em; color: var(--text-muted, #aaa);">No staff Steam IDs configured yet.</p>';
    return;
  }

  rosterDiv.innerHTML = '';
  staffList.forEach((member) => {
    const item = document.createElement('div');
    item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 0.5rem; background: rgba(255,255,255,0.04); border-radius: 4px; margin-bottom: 0.4rem;';

    const info = document.createElement('div');
    const role = document.createElement('strong');
    role.textContent = member.role;
    const username = document.createElement('span');
    username.textContent = ` - ${member.username || 'No username recorded'}`;
    const steamId = document.createElement('code');
    steamId.textContent = ` (${member.steamId})`;
    info.append(role, username, steamId);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'action-button small';
    removeBtn.style.cssText = 'padding: 0.2rem 0.5rem; font-size: 0.8em; background: #c0392b; border: none;';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      const updated = getStaffList().filter((s) => s.steamId !== member.steamId);
      saveStaffList(updated);
      showToast(`Removed Steam ID ${member.steamId} from staff.`);
      displaySteamStatus();
    });

    item.append(info, removeBtn);
    rosterDiv.appendChild(item);
  });
};

let lastRenderedCurrencyBalance = null;

const spawnCurrencyGainFx = (display, delta) => {
  const icon = display.querySelector('.currency-icon');
  if (icon) {
    icon.classList.remove('is-gaining');
    void icon.offsetWidth;
    icon.classList.add('is-gaining');
    icon.addEventListener('animationend', () => icon.classList.remove('is-gaining'), { once: true });
    // Safety net: if animationend never fires for any reason, the coin
    // would otherwise be stuck showing the one-shot "gain" pose forever
    // instead of resuming its idle sway/glimmer loop.
    setTimeout(() => icon.classList.remove('is-gaining'), 700);
  }
  const fx = document.createElement('span');
  fx.className = 'currency-gain-fx';
  fx.textContent = `+${Math.floor(delta).toLocaleString()}`;
  display.appendChild(fx);
  fx.addEventListener('animationend', () => fx.remove(), { once: true });
};

const renderCurrencyBalance = (balance) => {
  const display = document.querySelector('[data-currency-display]');
  const balanceEl = document.querySelector('[data-currency-balance]');
  const rounded = Math.floor(balance);
  if (display && balanceEl) {
    display.hidden = false;
    if (lastRenderedCurrencyBalance !== null && rounded > lastRenderedCurrencyBalance) {
      spawnCurrencyGainFx(display, rounded - lastRenderedCurrencyBalance);
    }
    balanceEl.textContent = rounded.toLocaleString();
  }
  lastRenderedCurrencyBalance = rounded;
  const earningsBalanceEl = document.querySelector('[data-coin-earnings-balance]');
  if (earningsBalanceEl) earningsBalanceEl.textContent = rounded.toLocaleString();
};

// ── Coin Earnings (Profile tab) ──
//
// Pure reference math, mirrors main.lua's playtime-accrual constants
// exactly (CURRENCY_BASE_RATE_PER_MIN / CURRENCY_DEFAULT_MULTIPLIER /
// CURRENCY_SPECIES_MULTIPLIER) — update both together if the in-game
// rate ever changes. This is just showing players the same math the
// mod already runs every 5 minutes they're spawned in, so it's static
// reference info rather than something that needs its own poll; only
// the live balance line (wired through renderCurrencyBalance above)
// actually refreshes on a timer.
const COIN_BASE_RATE_PER_MIN = 95;
const COIN_DEFAULT_MULTIPLIER = 2.0;
const COIN_FAST_MULTIPLIER = 7.5;

const renderCoinEarningsRates = () => {
  const defaultRateEl = document.querySelector('[data-coin-earnings-default-rate]');
  const fastRateEl = document.querySelector('[data-coin-earnings-fast-rate]');
  const exampleEl = document.querySelector('[data-coin-earnings-example]');
  if (!defaultRateEl || !fastRateEl || !exampleEl) return;

  const defaultPerMin = COIN_BASE_RATE_PER_MIN * COIN_DEFAULT_MULTIPLIER;
  const fastPerMin = COIN_BASE_RATE_PER_MIN * COIN_FAST_MULTIPLIER;
  defaultRateEl.textContent = `${Math.round(defaultPerMin).toLocaleString()}/min (${Math.round(defaultPerMin * 60).toLocaleString()}/hour)`;
  fastRateEl.textContent = `${Math.round(fastPerMin).toLocaleString()}/min (${Math.round(fastPerMin * 60).toLocaleString()}/hour)`;

  const exampleMinutes = 30;
  const examplePayout = Math.round(defaultPerMin * exampleMinutes);
  exampleEl.textContent = `Example: ${exampleMinutes} minutes played on a ${COIN_DEFAULT_MULTIPLIER}x species pays out ${examplePayout.toLocaleString()} coins. Coins are added automatically every 5 minutes you're spawned in and connected — check back and watch your balance climb.`;
};

const updateCoinEarningsSection = (profile) => {
  const section = document.querySelector('[data-coin-earnings-section]');
  if (!section) return;
  section.hidden = !profile;
  if (profile) renderCoinEarningsRates();
};

const loadCurrencyBalance = async () => {
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    const display = document.querySelector('[data-currency-display]');
    if (display) display.hidden = true;
    return;
  }
  try {
    const response = await fetch(`/api/currency-balance?steamId=${encodeURIComponent(profile.steamId)}`);
    const data = await response.json();
    if (response.ok && typeof data.balance === 'number') renderCurrencyBalance(data.balance);
  } catch (error) {
    console.debug('Currency balance load failed:', error);
  }
};

// ── Dino History (Profile tab) + ticket dino-picker ──

const DINO_HISTORY_EVENT_LABELS = {
  spawn: 'Spawned',
  parked: 'Parked',
  redeemed: 'Redeemed',
  died: 'Died',
  disconnected: 'Disconnected',
};

const DINO_HISTORY_STATUS_LABELS = {
  alive: 'Alive',
  parked: 'Parked',
  dead: 'Dead',
  disconnected: 'Disconnected',
};

let dinoHistoryEntries = [];

const buildDinoHistoryCard = (entry) => {
  const card = document.createElement('div');
  card.className = 'panel dino-history-card';

  const header = document.createElement('div');
  header.className = 'dino-history-card-header';
  const title = document.createElement('strong');
  title.textContent = entry.species || 'Unknown species';
  const badge = document.createElement('span');
  badge.className = `badge dino-history-status-${entry.status || 'alive'}`;
  badge.textContent = DINO_HISTORY_STATUS_LABELS[entry.status] || entry.status || 'Alive';
  header.append(title, badge);

  const timeline = document.createElement('ul');
  timeline.className = 'dino-history-timeline';
  (entry.events || []).forEach((evt) => {
    const item = document.createElement('li');
    const when = evt.at ? new Date(evt.at * 1000).toLocaleString() : '';
    item.textContent = `${DINO_HISTORY_EVENT_LABELS[evt.type] || evt.type} — ${(evt.growthPct || 0).toFixed(1)}% growth — ${when}`;
    timeline.appendChild(item);
  });

  card.append(header, timeline);
  return card;
};

const renderDinoHistoryList = (entries) => {
  const list = document.querySelector('[data-dino-history-list]');
  if (!list) return;
  list.innerHTML = '';
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No dino history yet — spawn in-game to start one.';
    list.appendChild(empty);
    return;
  }
  const sorted = [...entries].sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
  sorted.forEach((entry) => list.appendChild(buildDinoHistoryCard(entry)));
};

const populateTicketDinoOptions = (entries) => {
  const select = document.querySelector('[data-ticket-dino]');
  if (!select) return;
  const previousValue = select.value;
  select.innerHTML = '<option value="">Not specified</option>';
  [...entries]
    .sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0))
    .forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.dinoId;
      const statusLabel = DINO_HISTORY_STATUS_LABELS[entry.status] || entry.status || '';
      option.textContent = `${entry.species || 'Unknown'} — ${statusLabel}`;
      select.appendChild(option);
    });
  if ([...select.options].some((opt) => opt.value === previousValue)) select.value = previousValue;
};

const loadDinoHistory = async () => {
  const profile = getSteamProfile();
  const section = document.querySelector('[data-dino-history-section]');
  if (!profile?.steamId) {
    if (section) section.hidden = true;
    dinoHistoryEntries = [];
    populateTicketDinoOptions(dinoHistoryEntries);
    return;
  }
  if (section) section.hidden = false;
  try {
    const response = await fetch(`/api/dino-history?steamId=${encodeURIComponent(profile.steamId)}`);
    const data = await response.json();
    if (response.ok && Array.isArray(data.entries)) {
      dinoHistoryEntries = data.entries;
      renderDinoHistoryList(dinoHistoryEntries);
      populateTicketDinoOptions(dinoHistoryEntries);
    }
  } catch (error) {
    console.debug('Dino history load failed:', error);
  }
};

// ── Support tickets ──

const initTicketForm = async () => {
  const profile = getSteamProfile();
  const signedIn = document.querySelector('[data-ticket-signed-in]');
  const signedOut = document.querySelector('[data-ticket-signed-out]');
  const needsDiscord = document.querySelector('[data-ticket-needs-discord]');
  const myTicketsSection = document.querySelector('[data-my-tickets-section]');

  if (signedOut) signedOut.hidden = !!profile;
  if (!profile) {
    if (signedIn) signedIn.hidden = true;
    if (needsDiscord) needsDiscord.hidden = true;
    if (myTicketsSection) myTicketsSection.hidden = true;
    return;
  }

  if (myTicketsSection) myTicketsSection.hidden = false;
  loadMyTickets();

  let linked = false;
  try {
    const response = await fetch(`/api/discord-link-status?steamId=${encodeURIComponent(profile.steamId)}`);
    const data = await response.json();
    linked = !!data.linked;
  } catch (error) {
    console.debug('Discord link status check failed:', error);
  }

  if (signedIn) signedIn.hidden = !linked;
  if (needsDiscord) {
    needsDiscord.hidden = linked;
    const linkBtn = needsDiscord.querySelector('[data-ticket-link-discord]');
    if (linkBtn) linkBtn.href = `/api/discord-login?steamId=${encodeURIComponent(profile.steamId)}`;
  }
  if (!linked) return;

  const steamIdInput = document.querySelector('[data-ticket-steamid]');
  if (steamIdInput) steamIdInput.value = profile.steamId;

  const timeInput = document.querySelector('[data-ticket-time]');
  if (timeInput && !timeInput.value) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    timeInput.value = now.toISOString().slice(0, 16);
  }
};

const TICKET_STATUS_LABELS = { open: 'Open', claimed: 'Claimed' };

const buildTicketCard = (ticket) => {
  const card = document.createElement('div');
  card.className = 'panel dino-history-card';

  const header = document.createElement('div');
  header.className = 'dino-history-card-header';
  const title = document.createElement('strong');
  title.textContent = ticket.dinoLabel && ticket.dinoLabel !== 'Not specified' ? ticket.dinoLabel : 'Ticket';
  const badge = document.createElement('span');
  badge.className = `badge dino-history-status-${ticket.status === 'claimed' ? 'parked' : 'alive'}`;
  badge.textContent = ticket.status === 'claimed'
    ? `Claimed by ${ticket.claimedByName || 'staff'}`
    : (TICKET_STATUS_LABELS[ticket.status] || ticket.status);
  header.append(title, badge);

  const reason = document.createElement('p');
  reason.className = 'dino-park-note';
  reason.textContent = ticket.reason;

  const when = document.createElement('p');
  when.className = 'dino-park-note';
  when.textContent = ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : '';

  card.append(header, reason, when);
  return card;
};

const loadMyTickets = async () => {
  const profile = getSteamProfile();
  const list = document.querySelector('[data-my-tickets-list]');
  if (!list || !profile?.steamId) return;
  try {
    const response = await fetch(`/api/my-tickets?steamId=${encodeURIComponent(profile.steamId)}`);
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.tickets)) return;
    list.innerHTML = '';
    if (!data.tickets.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No tickets submitted yet.';
      list.appendChild(empty);
      return;
    }
    data.tickets
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .forEach((ticket) => list.appendChild(buildTicketCard(ticket)));
  } catch (error) {
    console.debug('My tickets load failed:', error);
  }
};

document.querySelector('[data-ticket-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  const reason = document.querySelector('[data-ticket-reason]')?.value.trim();
  if (!reason) {
    showToast('Enter a reason.');
    return;
  }
  const incidentTime = document.querySelector('[data-ticket-time]')?.value;
  if (!incidentTime) {
    showToast('Enter when it happened.');
    return;
  }
  const dinoSelect = document.querySelector('[data-ticket-dino]');
  const dinoLabel = dinoSelect?.value ? dinoSelect.options[dinoSelect.selectedIndex].textContent : null;

  const body = {
    steamId: profile.steamId,
    username: profile.username,
    reason,
    incidentTime,
    dinoLabel,
  };

  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const response = await fetch('/api/submit-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showToast(data.error || 'Could not submit that ticket.');
    } else {
      showToast('Ticket submitted — staff will follow up in Discord.');
      event.target.reset();
      initTicketForm();
    }
  } catch (error) {
    console.debug('Ticket submission failed:', error);
    showToast('Could not reach the server right now.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

const displaySteamStatus = async () => {
  const profile = getSteamProfile();
  const discordProfile = getDiscordProfile();
  const statusDiv = document.getElementById('profileStatus');
  const statusMessage = document.getElementById('statusMessage');
  const staffRoleBadge = document.getElementById('staffRoleBadge');
  const staffPermsList = document.getElementById('staffPermsList');
  const headerSteamBtn = document.getElementById('headerSteamBtn');
  const connectSteamBtn = document.getElementById('connectSteamBtn');

  if (headerSteamBtn) {
    if (profile) {
      headerSteamBtn.textContent = profile.username;
      headerSteamBtn.href = '#profile';
      fitTextToBox(headerSteamBtn);
      loadCurrencyBalance();
    } else {
      headerSteamBtn.textContent = 'Steam';
      headerSteamBtn.href = '/api/steam-login';
      headerSteamBtn.style.fontSize = '';
      loadCurrencyBalance();
    }
  }
  if (connectSteamBtn) {
    connectSteamBtn.textContent = profile ? 'Connected (Steam)' : 'Login with Steam';
    connectSteamBtn.classList.toggle('is-connected', !!profile);
  }
  // The Profile page's plain "Login with Discord" button previously never
  // carried a steamId, so using it (instead of the Support tab's dedicated
  // "Link Discord" button) never actually persisted a link — a player
  // could go through the whole Discord OAuth flow and see a success toast
  // with no real link ever recorded. Any Discord login now links, as long
  // as they're already signed in with Steam at the time (the caller's
  // verified session, not a client-supplied steamId param).
  const connectDiscordBtn = document.getElementById('connectDiscordBtn');
  if (connectDiscordBtn) {
    connectDiscordBtn.textContent = discordProfile ? 'Connected (Discord)' : 'Login with Discord';
    connectDiscordBtn.classList.toggle('is-connected', !!discordProfile);
  }
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.hidden = !profile && !discordProfile;
  loadDinoHistory();
  updateCoinEarningsSection(profile);
  initTicketForm();
  updateChatSignInState();

  if (!statusDiv || !statusMessage) return;

  if (profile || discordProfile) {
    statusDiv.style.display = 'block';
    statusMessage.innerHTML = profile
      ? `✓ <strong>Steam Account Connected!</strong><br>ID: <code>${profile.steamId}</code><br>Username: <strong>${profile.username}</strong>`
      : `✓ <strong>Discord Account Connected!</strong><br>Username: <strong>${discordProfile.username}</strong>`;

    // Check staff permissions either from local list or API
    const staffList = getStaffList();
    const matchedStaff = profile ? staffList.find((s) => s.steamId === profile.steamId) : null;
    if (matchedStaff && profile?.username && matchedStaff.username !== profile.username) {
      matchedStaff.username = profile.username;
      localStorage.setItem(staffStorageKey, JSON.stringify(staffList));
      renderStaffRoster();
    }
    let activeRole = discordProfile?.staffRole || (matchedStaff ? matchedStaff.role : (profile?.staffRole || 'Player'));

    // Attempt API verification for latest server permissions
    try {
      if (!profile) throw new Error('No Steam account connected');
      const res = await fetch(`/api/permissions?steam_id=${profile.steamId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.is_staff && data.role) {
          activeRole = data.role;
        }
      }
    } catch {
      // Fallback to local staff list
    }

    const details = roleDetailsMap[activeRole] || roleDetailsMap.Player;
    updateStaffArea(activeRole);

    if (staffRoleBadge) {
      staffRoleBadge.textContent = details.badge;
      staffRoleBadge.style.color = activeRole !== 'Player' ? '#5ae4ff' : '#aaa';
    }

    if (staffPermsList) {
      if (activeRole !== 'Player') {
        staffPermsList.innerHTML = `✅ <strong>Automatic In-Game Permissions Granted:</strong><br><span style="font-family: monospace; color: #5ae4ff;">${details.perms.join(', ')}</span>`;
      } else {
        staffPermsList.innerHTML = `ℹ️ Standard player account. (Add Steam ID to Staff Roster below to auto-grant in-game permissions).`;
      }
    }
  } else {
    updateStaffArea();
  }
};

// Handle adding new staff Steam IDs
const addStaffForm = document.getElementById('addStaffForm');
if (addStaffForm) {
  addStaffForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const steamIdInput = document.getElementById('staffSteamIdInput');
    const usernameInput = document.getElementById('staffUsernameInput');
    const roleSelect = document.getElementById('staffRoleSelect');

    const steamId = steamIdInput?.value.trim();
    const username = usernameInput?.value.trim();
    const role = roleSelect?.value || 'Admin';

    if (!steamId || !/^\d{17}$/.test(steamId) || !username) {
      showToast('Enter a Steam ID and username.');
      return;
    }

    const staffList = getStaffList();
    const existingIndex = staffList.findIndex((s) => s.steamId === steamId);

    if (existingIndex >= 0) {
      staffList[existingIndex].role = role;
      staffList[existingIndex].username = username;
    } else {
      staffList.push({ steamId, username, role });
    }

    saveStaffList(staffList);
    steamIdInput.value = '';
    usernameInput.value = '';
    showToast(`Saved ${role} permissions for ${username}.`);
    displaySteamStatus();
  });
}

// Steam redirects back to /#profile?steam_id=...&steam_name=... after a successful login
const consumeSteamRedirect = () => {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return;

  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  const steamId = params.get('steam_id');
  const steamName = params.get('steam_name');
  const staffRole = params.get('staff_role');
  const discordId = params.get('discord_id');
  const discordName = params.get('discord_name');
  const discordRole = params.get('discord_role');
  const discordLinked = params.get('discord_linked') === '1';

  if (params.get('ban_error')) {
    showToast('This Steam account is banned from LeveLs.');
  } else if (params.get('discord_error')) {
    showToast('Discord login failed. Make sure you are in the Levels Discord server.');
  } else if (discordId && discordName && discordRole) {
    setDiscordProfile(discordId, discordName, discordRole);
    showToast(discordLinked
      ? `Discord linked as ${discordName} — you can now submit tickets.`
      : 'Discord permissions connected successfully!');
    if (discordLinked) initTicketForm();
  } else if (params.get('steam_error')) {
    showToast('Steam login failed. Please try again.');
  } else if (steamId && /^\d{17}$/.test(steamId) && steamName) {
    setSteamProfile(steamId, steamName, staffRole || '');
    showToast('Steam account connected successfully!');
  }

  history.replaceState(null, '', `${window.location.pathname}#profile`);
};

consumeSteamRedirect();

// Render staff roster and Steam profile status on page load
renderStaffRoster();
displaySteamStatus();
// Cheap KV read on the Worker side — a 30s poll is plenty responsive for
// a balance that only actually changes every 5 minutes of playtime or on
// an admin grant.
setInterval(loadCurrencyBalance, 30000);

// ── Website presence (for the Friends tab's online indicator) ──
//
// A lightweight heartbeat: while this tab is open, ping every 3 minutes so
// functions/api/presence.js can tell friends "online" from "not." A single
// shared presence:index KV entry per player (overwritten, not appended)
// keeps this off the per-event write-quota problem the currency/dino-
// history systems had to design around — this never grows with heartbeat
// frequency, only with total distinct players ever seen.
//
// Deliberately does NOT gate on document.visibilityState — a real reported
// case: a player's tab was open but backgrounded (not the focused tab)
// while they were off doing something else, heartbeats stopped firing
// entirely, and they read as offline to friends within 5 minutes even
// though the site was genuinely still open. "Online on website" means the
// tab is open, not that it's the one currently in focus.
const sendHeartbeat = () => {
  const profile = getSteamProfile();
  if (!profile?.steamId) return;
  fetch('/api/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steamId: profile.steamId }),
  }).catch((error) => console.debug('Heartbeat failed:', error));
};
sendHeartbeat();
setInterval(sendHeartbeat, 180000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sendHeartbeat();
});

// A player's displayed username was only ever set once, at login time,
// and cached in localStorage from then on — a real reported case: someone
// renamed on Steam and the site kept showing their old name for days,
// since nothing ever re-checked it outside of a fresh OAuth login. This
// re-resolves it straight from Steam periodically and updates the cached
// profile (+ re-renders) whenever it actually changed. No KV quota
// concern here at all — this never touches list(), and the one KV write
// functions/api/steam-username.js does only fires on an actual rename,
// not on every poll.
const refreshSteamUsername = async () => {
  const profile = getSteamProfile();
  if (!profile?.steamId) return;
  try {
    const response = await fetch(`/api/steam-username?steamId=${encodeURIComponent(profile.steamId)}`);
    const data = await response.json();
    if (response.ok && data.username && data.username !== profile.username) {
      setSteamProfile(profile.steamId, data.username, profile.staffRole || '');
      displaySteamStatus();
    }
  } catch (error) {
    console.debug('Steam username refresh failed:', error);
  }
};
refreshSteamUsername();
setInterval(refreshSteamUsername, 3 * 60 * 1000);

// Global chat sidebar — a real shared chat (every signed-in player, not
// just friends), backed by a Durable Object WebSocket room (see
// workers/bridge-worker.js's ChatRoom): one live connection per open
// sidebar, pushed new messages the instant anyone sends one. Previously
// polled a KV key every 500ms — polling frequency was never the problem,
// KV writes simply aren't instantly visible everywhere, so messages still
// took several real seconds to show up for anyone but the sender no
// matter how often the poll ran. A Durable Object is one single
// authoritative in-memory room with no such lag.
const chatToggle = document.getElementById('chatToggle');
const chatSidebar = document.getElementById('chatSidebar');
const chatClose = document.getElementById('chatClose');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatTextInput = document.getElementById('chatText');
const chatHoneypot = document.getElementById('chatWebsite');

const chatMinIntervalMs = 1500;
let lastChatSendAt = 0;
let cachedChatMessages = [];
let chatSocket = null;
let chatReconnectTimer = null;
let chatSocketSteamId = null;
let chatConnectInFlight = false;
// Tracks steamIds already friend-requested from chat this page load, so
// the "+ Add" button doesn't offer to re-send across the frequent full
// re-renders renderChatMessages does on every incoming message (chat
// doesn't wait for lastLoadedFriends — populated by the Friends sidebar's
// own load — to catch up before hiding it).
const chatFriendRequestsSentTo = new Set();

const renderChatMessages = () => {
  if (!chatMessages) return;
  const wasScrolledToBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 40;
  chatMessages.innerHTML = '';

  const viewerSteamId = getSteamProfile()?.steamId;
  const friendIds = new Set(lastLoadedFriends.map((f) => f.steamId));

  cachedChatMessages.forEach((message) => {
    const item = document.createElement('div');
    item.className = 'chat-message';
    // Admin/owner only (viewerAdminTier, cached by checkAdminPanelAccess)
    // — openChatModerationMenu itself also checks this and no-ops
    // otherwise, so a regular player's native right-click menu is left
    // alone entirely.
    item.addEventListener('contextmenu', (event) => openChatModerationMenu(event, message));

    if (
      viewerSteamId
      && message.steamId
      && message.steamId !== viewerSteamId
      && !friendIds.has(message.steamId)
      && !chatFriendRequestsSentTo.has(message.steamId)
    ) {
      const addFriendBtn = document.createElement('button');
      addFriendBtn.type = 'button';
      addFriendBtn.className = 'chat-message-add-friend';
      addFriendBtn.textContent = '+ Add';
      addFriendBtn.addEventListener('click', async () => {
        addFriendBtn.disabled = true;
        try {
          const response = await fetch('/api/friend-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toSteamId: message.steamId }),
          });
          const responseData = await response.json();
          if (!response.ok || !responseData.ok) {
            showToast(responseData.error || 'Could not send that friend request.');
            addFriendBtn.disabled = false;
            return;
          }
          showToast(`Friend request sent to ${message.name}.`);
          chatFriendRequestsSentTo.add(message.steamId);
          renderChatMessages();
        } catch (error) {
          console.debug('Chat add-friend failed:', error);
          showToast('Could not reach the server right now.');
          addFriendBtn.disabled = false;
        }
      });
      item.appendChild(addFriendBtn);
    }

    const user = document.createElement('span');
    user.className = 'chat-message-user';
    user.textContent = message.name;

    const time = document.createElement('span');
    time.className = 'chat-message-time';
    time.textContent = new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const text = document.createElement('span');
    text.className = 'chat-message-text';
    text.textContent = message.text;

    item.append(user, time, document.createElement('br'), text);
    chatMessages.appendChild(item);
  });

  if (wasScrolledToBottom) chatMessages.scrollTop = chatMessages.scrollHeight;
};

// ── Chat moderation: right-click a message (admin/owner only, gated by
// viewerAdminTier — cached from checkAdminPanelAccess() further down this
// file, no separate lookup needed here) for a small menu to delete that
// message or open a moderation view for its sender. ──
let chatModerationTargetMessage = null;
const chatModerationMenu = document.getElementById('chatModerationMenu');

const closeChatModerationMenu = () => {
  if (chatModerationMenu) chatModerationMenu.hidden = true;
  chatModerationTargetMessage = null;
};

const openChatModerationMenu = (event, message) => {
  if (!viewerAdminTier || !chatModerationMenu) return;
  event.preventDefault();
  chatModerationTargetMessage = message;
  chatModerationMenu.style.left = `${event.clientX}px`;
  chatModerationMenu.style.top = `${event.clientY}px`;
  chatModerationMenu.hidden = false;
};

document.addEventListener('click', (event) => {
  if (chatModerationMenu && !chatModerationMenu.hidden && !chatModerationMenu.contains(event.target)) {
    closeChatModerationMenu();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeChatModerationMenu();
});

document.querySelector('[data-chat-menu-delete]')?.addEventListener('click', async () => {
  const message = chatModerationTargetMessage;
  closeChatModerationMenu();
  if (!message) return;
  try {
    const response = await fetch('/api/chat-delete-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: message.id }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showToast(data.error || 'Could not delete that message.');
    }
    // No local removal here — ChatRoom broadcasts {type:'delete'} back to
    // every connected client including this one, and that's the only
    // place cachedChatMessages actually gets filtered (see the socket
    // message handler in connectChatSocket).
  } catch (error) {
    console.debug('Chat delete-message failed:', error);
    showToast('Could not reach the server right now.');
  }
});

document.querySelector('[data-chat-menu-moderate]')?.addEventListener('click', () => {
  const message = chatModerationTargetMessage;
  closeChatModerationMenu();
  if (!message) return;
  openChatModerationModal(message.steamId, message.name);
});

const openChatModerationModal = async (targetSteamId, targetName) => {
  if (!parkedModalContent || !parkedModalOverlay) return;
  const label = targetName || targetSteamId;

  const wrapper = document.createElement('div');

  const heading = document.createElement('div');
  heading.className = 'mini-heading';
  heading.textContent = `Moderate ${label}`;
  wrapper.appendChild(heading);

  const idNote = document.createElement('p');
  idNote.className = 'dino-park-note';
  idNote.textContent = `Steam ID: ${targetSteamId}`;
  wrapper.appendChild(idNote);

  const timeoutRow = document.createElement('div');
  timeoutRow.className = 'field-row two-up';
  const timeoutLabel = document.createElement('label');
  timeoutLabel.textContent = 'Timeout duration';
  const timeoutSelect = document.createElement('select');
  for (let h = 1; h <= 24; h += 1) {
    const option = document.createElement('option');
    option.value = String(h);
    option.textContent = `${h} hour${h === 1 ? '' : 's'}`;
    timeoutSelect.appendChild(option);
  }
  timeoutLabel.appendChild(timeoutSelect);

  const timeoutActions = document.createElement('div');
  timeoutActions.className = 'submit-actions field-inline-action';
  const timeoutBtn = document.createElement('button');
  timeoutBtn.type = 'button';
  timeoutBtn.className = 'action-button small';
  timeoutBtn.textContent = 'Apply timeout';
  timeoutBtn.addEventListener('click', async () => {
    timeoutBtn.disabled = true;
    try {
      const response = await fetch('/api/chat-timeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSteamId, hours: Number(timeoutSelect.value) }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        showToast(data.error || 'Could not apply that timeout.');
      } else {
        showToast(`${label} timed out for ${timeoutSelect.value} hour${timeoutSelect.value === '1' ? '' : 's'}.`);
      }
    } catch (error) {
      console.debug('Chat timeout failed:', error);
      showToast('Could not reach the server right now.');
    } finally {
      timeoutBtn.disabled = false;
    }
  });
  timeoutActions.appendChild(timeoutBtn);
  timeoutRow.append(timeoutLabel, timeoutActions);
  wrapper.appendChild(timeoutRow);

  const banLabel = document.createElement('label');
  banLabel.className = 'chat-ban-toggle';
  const banCheckbox = document.createElement('input');
  banCheckbox.type = 'checkbox';
  banLabel.append(banCheckbox, ' Ban from the entire website');
  wrapper.appendChild(banLabel);

  banCheckbox.addEventListener('change', async () => {
    const wantsBanned = banCheckbox.checked;
    if (wantsBanned && !window.confirm(`Ban ${label} from the entire website? This can be undone later from here.`)) {
      banCheckbox.checked = false;
      return;
    }
    banCheckbox.disabled = true;
    try {
      const response = await fetch('/api/chat-ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSteamId, banned: wantsBanned }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        showToast(data.error || 'Could not update that ban.');
        banCheckbox.checked = !wantsBanned;
      } else {
        showToast(wantsBanned ? `${label} banned from the website.` : `${label} unbanned.`);
      }
    } catch (error) {
      console.debug('Chat ban failed:', error);
      showToast('Could not reach the server right now.');
      banCheckbox.checked = !wantsBanned;
    } finally {
      banCheckbox.disabled = false;
    }
  });

  parkedModalContent.replaceChildren(wrapper);
  parkedModalOverlay.hidden = false;

  try {
    const response = await fetch(`/api/chat-moderation-status?targetSteamId=${encodeURIComponent(targetSteamId)}`);
    const data = await response.json();
    if (response.ok && data.ok) banCheckbox.checked = !!data.banned;
  } catch (error) {
    console.debug('Chat moderation status failed:', error);
  }
};

// Connects only while the sidebar is actually open, rather than holding a
// socket open for every visitor site-wide regardless of whether they ever
// look at chat.
const connectChatSocket = async () => {
  const profile = getSteamProfile();
  if (!profile?.steamId) return;
  if (chatSocket && (chatSocket.readyState === WebSocket.OPEN || chatSocket.readyState === WebSocket.CONNECTING)) return;
  // The ticket fetch below is async, unlike the rest of this check — this
  // guard keeps two overlapping calls (e.g. the sidebar toggle firing
  // right as a visibilitychange reconnect kicks in) from both slipping
  // past the readyState check above and opening two sockets.
  if (chatConnectInFlight) return;
  chatConnectInFlight = true;

  // A raw steamId/name in the URL used to be trusted outright by the
  // Worker — anyone could open this socket claiming to be any player.
  // The cookie that actually proves who's signed in is scoped to this
  // site's own domain and never reaches the Worker's separate
  // workers.dev origin below, so this fetches a short-lived signed
  // ticket same-origin first (where the cookie IS visible) instead.
  let ticket;
  try {
    const ticketResponse = await fetch(`/api/chat-ticket?name=${encodeURIComponent(profile.username || profile.steamId)}`);
    const ticketData = await ticketResponse.json();
    if (!ticketResponse.ok || !ticketData.ticket) return;
    ticket = ticketData.ticket;
  } catch (error) {
    console.debug('Chat ticket fetch failed:', error);
    return;
  } finally {
    chatConnectInFlight = false;
  }

  // Connects straight to the Worker's own workers.dev subdomain rather
  // than l-e-v-e-l-s.app's own routed path — confirmed live: the exact
  // same Durable Object code completes the WebSocket handshake perfectly
  // on workers.dev but gets an abnormal 1006 closure specifically via the
  // custom-domain route (a Cloudflare zone/route quirk, not a code bug —
  // the zone's WebSockets setting is already confirmed on). WebSocket
  // connections aren't subject to the same-origin restrictions fetch()
  // has, so connecting cross-origin like this is normal and safe.
  const chatWorkerOrigin = 'wss://l-e-v-e-l-s.conlan-schlaeppi.workers.dev';
  const url = `${chatWorkerOrigin}/chat-ws?ticket=${encodeURIComponent(ticket)}`;

  let socket;
  try {
    socket = new WebSocket(url);
  } catch (error) {
    console.debug('Chat socket creation failed:', error);
    return;
  }
  chatSocket = socket;
  chatSocketSteamId = profile.steamId;

  socket.addEventListener('message', (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (data.type === 'history' && Array.isArray(data.messages)) {
      cachedChatMessages = data.messages;
      renderChatMessages();
      renderWebsiteChatLog();
    } else if (data.type === 'message' && data.message) {
      cachedChatMessages = [...cachedChatMessages, data.message].slice(-200);
      renderChatMessages();
      renderWebsiteChatLog();
    } else if (data.type === 'delete' && data.messageId) {
      // A moderator deleted a message (see the right-click menu below) —
      // broadcast to every connected client, including the one that
      // triggered it, so this is the only place removal actually happens.
      cachedChatMessages = cachedChatMessages.filter((m) => m.id !== data.messageId);
      renderChatMessages();
      renderWebsiteChatLog();
    } else if (data.type === 'error' && data.message) {
      // e.g. "you're timed out from chat until ..." — sent back to just
      // the sender, never broadcast.
      showToast(data.message);
    }
  });

  const scheduleReconnect = () => {
    if (chatSocket === socket) chatSocket = null;
    if (chatReconnectTimer || !chatSidebar?.classList.contains('is-open')) return;
    chatReconnectTimer = setTimeout(() => {
      chatReconnectTimer = null;
      if (chatSidebar?.classList.contains('is-open')) connectChatSocket();
    }, 2000);
  };
  socket.addEventListener('close', scheduleReconnect);
  socket.addEventListener('error', () => socket.close());
};

const disconnectChatSocket = () => {
  if (chatReconnectTimer) {
    clearTimeout(chatReconnectTimer);
    chatReconnectTimer = null;
  }
  chatSocketSteamId = null;
  if (chatSocket) {
    const socket = chatSocket;
    chatSocket = null;
    socket.close();
  }
};

const openChat = () => {
  chatSidebar?.classList.add('is-open');
  chatSidebar?.setAttribute('aria-hidden', 'false');
  chatToggle?.setAttribute('aria-expanded', 'true');
  connectChatSocket();
};

const closeChat = () => {
  chatSidebar?.classList.remove('is-open');
  chatSidebar?.setAttribute('aria-hidden', 'true');
  chatToggle?.setAttribute('aria-expanded', 'false');
  disconnectChatSocket();
};

chatToggle?.addEventListener('click', () => {
  const isOpen = chatSidebar?.classList.contains('is-open');
  if (isOpen) {
    closeChat();
  } else {
    openChat();
  }
});

chatClose?.addEventListener('click', closeChat);

const updateChatSignInState = () => {
  const profile = getSteamProfile();
  const signedOut = document.querySelector('[data-chat-signed-out]');
  const signedIn = document.querySelector('[data-chat-signed-in]');
  if (signedOut) signedOut.hidden = !!profile;
  if (signedIn) signedIn.hidden = !profile;
  // Only touches the socket when the identity actually changed — this
  // runs after lots of unrelated actions (any displaySteamStatus() call),
  // so reconnecting unconditionally every time would drop and re-fetch
  // history on a live connection for no reason.
  if (chatSidebar?.classList.contains('is-open') && profile?.steamId !== chatSocketSteamId) {
    disconnectChatSocket();
    if (profile) connectChatSocket();
  }
};

chatForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  // Bots tend to fill every field, including the hidden honeypot; humans never see it
  if (chatHoneypot && chatHoneypot.value) {
    return;
  }

  const profile = getSteamProfile();
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }

  const now = Date.now();
  if (now - lastChatSendAt < chatMinIntervalMs) {
    showToast('You are sending messages too quickly.');
    return;
  }

  const text = chatTextInput?.value.trim().slice(0, 240);
  if (!text) return;

  if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
    showToast('Reconnecting to chat — try again in a moment.');
    connectChatSocket();
    return;
  }

  lastChatSendAt = now;
  if (chatTextInput) chatTextInput.value = '';
  // No optimistic local echo needed — the room broadcasts back to every
  // connected socket, sender included, fast enough that a separate
  // local-first render would just be a redundant extra one, not a real
  // latency win like it was under the old polling design.
  chatSocket.send(JSON.stringify({ text }));
  chatTextInput?.focus();
});

updateChatSignInState();

const ticketStorageKey = 'levelsStaffTickets';
let selectedTicketId = null;

const getTickets = () => {
  try {
    const tickets = JSON.parse(localStorage.getItem(ticketStorageKey) || '[]');
    return Array.isArray(tickets) ? tickets : [];
  } catch {
    return [];
  }
};

const saveTickets = (tickets) => {
  localStorage.setItem(ticketStorageKey, JSON.stringify(tickets));
  renderTicketQueue();
  renderTicketLog();
};

const formatLogTime = (timestamp) => new Date(timestamp).toLocaleString([], {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

const renderWebsiteChatLog = () => {
  const chatLog = document.getElementById('websiteChatLog');
  if (!chatLog || !hasDevToolsAccess()) return;

  chatLog.replaceChildren();
  if (!cachedChatMessages.length) {
    chatLog.textContent = 'No website chat messages yet.';
    return;
  }

  cachedChatMessages.slice(-20).reverse().forEach((message) => {
    const entry = document.createElement('div');
    entry.className = 'ticket-log-entry';
    const meta = document.createElement('span');
    meta.textContent = `${message.name} - ${formatLogTime(message.at)}`;
    const text = document.createElement('div');
    text.textContent = message.text;
    entry.append(meta, text);
    chatLog.appendChild(entry);
  });
};

const renderTicketQueue = () => {
  const queue = document.getElementById('ticketQueue');
  const filter = document.getElementById('ticketFilter');
  if (!queue || !hasDevToolsAccess()) return;

  const category = filter?.value || 'All';
  const tickets = getTickets().filter((ticket) => category === 'All' || ticket.category === category);
  queue.replaceChildren();
  if (!tickets.length) {
    queue.textContent = 'No tickets in this category.';
    return;
  }

  tickets.sort((first, second) => second.createdAt - first.createdAt).forEach((ticket) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `ticket-item${ticket.id === selectedTicketId ? ' is-selected' : ''}`;
    item.textContent = `${ticket.category} - ${ticket.subject} - ${formatLogTime(ticket.createdAt)}`;
    item.addEventListener('click', () => {
      selectedTicketId = ticket.id;
      renderTicketQueue();
      renderTicketLog();
    });
    queue.appendChild(item);
  });
};

const renderTicketLog = () => {
  const ticketLog = document.getElementById('ticketLog');
  const messageForm = document.getElementById('ticketMessageForm');
  const moderationActionForm = document.getElementById('moderationActionForm');
  if (!ticketLog || !messageForm || !moderationActionForm || !hasDevToolsAccess()) return;

  const ticket = getTickets().find((item) => item.id === selectedTicketId);
  ticketLog.replaceChildren();
  messageForm.hidden = !ticket;
  moderationActionForm.hidden = !ticket;
  if (!ticket) {
    ticketLog.textContent = 'Select a ticket to view its conversation and image evidence.';
    return;
  }

  ticket.entries.forEach((entry) => {
    const logEntry = document.createElement('div');
    logEntry.className = 'ticket-log-entry';
    const meta = document.createElement('span');
    meta.textContent = `${entry.author} - ${formatLogTime(entry.createdAt)}`;
    const text = document.createElement('div');
    text.textContent = entry.text;
    logEntry.append(meta, text);
    ticketLog.appendChild(logEntry);
  });
};

document.getElementById('ticketFilter')?.addEventListener('change', renderTicketQueue);

document.getElementById('ticketForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!hasDevToolsAccess()) return;

  const category = document.getElementById('ticketCategory').value;
  const subject = document.getElementById('ticketSubject').value.trim();
  const details = document.getElementById('ticketDetails').value.trim();
  const attachments = [...document.getElementById('ticketAttachments').files].map((file) => file.name);
  const profile = getSteamProfile();
  if (!subject || !details) return;

  const createdAt = Date.now();
  const ticket = {
    id: crypto.randomUUID(),
    category,
    subject,
    createdAt,
    attachments,
    entries: [{ author: profile?.username || 'Staff', text: details, createdAt }],
  };
  const tickets = getTickets();
  tickets.push(ticket);
  selectedTicketId = ticket.id;
  saveTickets(tickets);
  event.currentTarget.reset();
  showToast('Ticket created.');
});

document.getElementById('ticketMessageForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!hasDevToolsAccess()) return;

  const input = document.getElementById('ticketMessage');
  const text = input.value.trim();
  const tickets = getTickets();
  const ticket = tickets.find((item) => item.id === selectedTicketId);
  if (!ticket || !text) return;

  ticket.entries.push({ author: getSteamProfile()?.username || 'Staff', text, createdAt: Date.now() });
  saveTickets(tickets);
  input.value = '';
});

const updateModerationActionFields = () => {
  const action = document.getElementById('moderationAction')?.value;
  const durationField = document.getElementById('moderationDurationField');
  const duration = document.getElementById('moderationDuration');
  const rulebreakField = document.getElementById('moderationRulebreakField');
  const reasonField = document.getElementById('moderationReasonField');
  const reason = document.getElementById('moderationReason');
  if (!durationField || !duration || !rulebreakField || !reasonField || !reason) return;

  durationField.hidden = action === 'Strike' || action === 'Ban';
  duration.disabled = action === 'Strike' || action === 'Ban';
  rulebreakField.hidden = action !== 'Strike';
  reasonField.hidden = action !== 'Ban';
  reason.required = action === 'Ban';

  if (action === 'Kick') {
    [...duration.options].forEach((option) => {
      option.hidden = !['1 minute', '5 minutes', '10 minutes'].includes(option.value);
    });
    if (!['1 minute', '5 minutes', '10 minutes'].includes(duration.value)) duration.value = '1 minute';
  } else {
    [...duration.options].forEach((option) => {
      option.hidden = false;
    });
  }
};

document.getElementById('moderationAction')?.addEventListener('change', updateModerationActionFields);
updateModerationActionFields();

document.getElementById('moderationActionForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!hasDevToolsAccess()) return;

  const player = document.getElementById('moderationPlayer').value.trim();
  const action = document.getElementById('moderationAction').value;
  const duration = document.getElementById('moderationDuration').value;
  const rulebreak = document.getElementById('moderationRulebreak').value;
  const reason = document.getElementById('moderationReason').value.trim();
  const tickets = getTickets();
  const ticket = tickets.find((item) => item.id === selectedTicketId);
  if (!ticket || !player || (action === 'Ban' && !reason)) return;

  const detail = action === 'Mute' || action === 'Kick'
    ? `${action}: ${player} for ${duration}.`
    : action === 'Strike'
      ? `Strike: ${player}. Rulebreak: ${rulebreak}.`
      : `Ban: ${player}. Reason: ${reason}`;
  ticket.entries.push({ author: getSteamProfile()?.username || 'Admin', text: detail, createdAt: Date.now() });
  saveTickets(tickets);
  event.currentTarget.reset();
  updateModerationActionFields();
  showToast(`${action} recorded in the ticket log.`);
});

renderTicketQueue();
renderTicketLog();
renderWebsiteChatLog();

// Initialize storage values for skin packs and server uptime
const initialSkinCount = getSkinPackCount();
setSkinPackCount(initialSkinCount);

const savedUptime = localStorage.getItem(serverUptimeStorageKey);
if (savedUptime) {
  updateServerUptime(Number.parseFloat(savedUptime));
}

// Server status monitoring system
const pollServerStatus = async () => {
  const serverId = getServerConfigId();
  if (!serverId) {
    updateServerUptime('--');
    updateActiveModsCount(0);
    return;
  }

  try {
    // Poll your game server API endpoint for live status
    // Replace this with your actual server status endpoint
    // Expected response: { uptime: 99.9, active_mods: 18, players_online: 5 }
    const response = await fetch(`/api/server-status?server_id=${encodeURIComponent(serverId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      if (typeof data.uptime === 'number') {
        updateServerUptime(data.uptime);
      }
      if (typeof data.active_mods === 'number') {
        updateActiveModsCount(data.active_mods);
      }
      if (typeof data.players_online === 'number') {
        updateServerPlayers(data.players_online, typeof data.max_players === 'number' ? data.max_players : 0);
      }
    }
  } catch (error) {
    console.debug('Server status poll failed:', error);
  }
};

// Poll server status every 30 seconds if a server ID is configured
let serverPollingInterval = null;

const startServerPolling = () => {
  if (serverPollingInterval) clearInterval(serverPollingInterval);
  pollServerStatus(); // Poll immediately on start
  serverPollingInterval = setInterval(pollServerStatus, 30000); // Then every 30 seconds
};

const stopServerPolling = () => {
  if (serverPollingInterval) {
    clearInterval(serverPollingInterval);
    serverPollingInterval = null;
  }
};

// Start polling if server ID already exists
if (getServerConfigId()) {
  startServerPolling();
}

// Expose server config functions for dev tools
window.levelsServerConfig = {
  setServerId: (id) => {
    setServerConfigId(id);
    if (id) {
      showToast(`Server ID configured: ${id}`);
      startServerPolling();
    } else {
      showToast('Server ID cleared.');
      stopServerPolling();
    }
  },
  getServerId: getServerConfigId,
  setSkinPacks: (count) => {
    setSkinPackCount(count);
    showToast(`Skin Packs updated to: ${count}`);
  },
  getSkinPacks: getSkinPackCount,
};

// Live Dino monitoring
const dinoSignedOut = document.querySelector('[data-dino-signed-out]');
const dinoEmpty = document.querySelector('[data-dino-empty]');
const dinoErrorBox = document.querySelector('[data-dino-error]');
const dinoErrorMessage = document.querySelector('[data-dino-error-message]');
const dinoLiveCard = document.querySelector('[data-dino-live]');
const mapDinoStrip = document.querySelector('[data-map-dino-strip]');
const mapNumbers = document.querySelector('[data-map-numbers]');
const mapMarker = document.querySelector('[data-map-marker]');
const mapMarkerArrow = document.querySelector('[data-map-marker-arrow]');

const setDinoView = (view, message) => {
  if (dinoSignedOut) dinoSignedOut.hidden = view !== 'signed-out';
  if (dinoEmpty) dinoEmpty.hidden = view !== 'empty';
  if (dinoErrorBox) dinoErrorBox.hidden = view !== 'error';
  if (dinoLiveCard) dinoLiveCard.hidden = view !== 'live';
  if (mapDinoStrip) mapDinoStrip.hidden = view !== 'live';
  if (mapNumbers) mapNumbers.hidden = view !== 'live';
  if (mapMarker) mapMarker.hidden = view !== 'live';
  if (view === 'error' && dinoErrorMessage && message) {
    dinoErrorMessage.textContent = message;
  }
};

// Gateway map calibration (Vulnona-sourced, matches workers/bridge-worker.js's world bounds)
const MAP_MIN_X = -607;
const MAP_MAX_X = 509;
const MAP_MIN_Y = -505;
const MAP_MAX_Y = 607;

const worldToMapFraction = (worldX, worldY) => {
  const sx = worldX / 1000;
  const sy = worldY / 1000;
  const fx = (sy - MAP_MIN_Y) / (MAP_MAX_Y - MAP_MIN_Y);
  const fy = (sx - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X);
  return { fx, fy };
};

// Snaps the marker to one of 8 compass headings (N/NE/E/SE/S/SW/W/NW) based on
// movement since the last poll, rather than pointing at an arbitrary angle.
let lastMarkerFraction = null;
let markerHeading = 0; // cumulative degrees, so rotation animates the short way around
const MARKER_MOVEMENT_THRESHOLD = 0.0015; // ignore sub-pixel jitter between polls

const updateMapMarkerHeading = (fx, fy) => {
  if (!mapMarkerArrow) return;
  if (lastMarkerFraction) {
    const dx = fx - lastMarkerFraction.fx;
    const dy = fy - lastMarkerFraction.fy;
    if (Math.hypot(dx, dy) >= MARKER_MOVEMENT_THRESHOLD) {
      const bearing = (Math.atan2(dx, -dy) * 180) / Math.PI;
      const snapped = (((Math.round(bearing / 45) * 45) % 360) + 360) % 360;
      const current = ((markerHeading % 360) + 360) % 360;
      let delta = snapped - current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      markerHeading += delta;
      mapMarkerArrow.style.transform = `rotate(${markerHeading}deg)`;
    }
  }
  lastMarkerFraction = { fx, fy };
};

const updateMapMarker = (location) => {
  if (!mapMarker || !location) return;
  const { fx, fy } = worldToMapFraction(location.x || 0, location.y || 0);
  mapMarker.style.left = `${Math.min(100, Math.max(0, fx * 100))}%`;
  mapMarker.style.top = `${Math.min(100, Math.max(0, fy * 100))}%`;
  updateMapMarkerHeading(fx, fy);
};

// Map pan/zoom — dependency-free. Pans and scales the whole .map-mount
// layer (image + marker together) via a CSS transform inside a
// fixed-aspect-ratio .map-viewport; the marker's own left/top percentages
// (set by updateMapMarker above) stay relative to .map-mount, so it moves
// and scales with the map for free, no extra coordination needed.
{
  const mapViewport = document.querySelector('[data-map-viewport]');
  const mapMount = document.querySelector('[data-map-mount]');

  if (mapViewport && mapMount) {
    const MIN_SCALE = 1;
    const MAX_SCALE = 4;
    let scale = MIN_SCALE;
    let tx = 0;
    let ty = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const applyTransform = () => {
      mapMount.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    };

    const clampPan = () => {
      const rect = mapViewport.getBoundingClientRect();
      const minX = Math.min(0, rect.width - rect.width * scale);
      const minY = Math.min(0, rect.height - rect.height * scale);
      tx = Math.min(0, Math.max(minX, tx));
      ty = Math.min(0, Math.max(minY, ty));
    };

    const setScale = (nextScale, originX, originY) => {
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
      if (clamped === scale) return;
      const rect = mapViewport.getBoundingClientRect();
      const px = originX ?? rect.width / 2;
      const py = originY ?? rect.height / 2;
      const ratio = clamped / scale;
      tx = px - (px - tx) * ratio;
      ty = py - (py - ty) * ratio;
      scale = clamped;
      if (scale === MIN_SCALE) {
        tx = 0;
        ty = 0;
      }
      clampPan();
      applyTransform();
      mapViewport.classList.toggle('is-zoomed', scale > MIN_SCALE);
    };

    mapViewport.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = mapViewport.getBoundingClientRect();
      setScale(scale + (event.deltaY > 0 ? -0.35 : 0.35), event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });

    mapViewport.addEventListener('dblclick', (event) => {
      const rect = mapViewport.getBoundingClientRect();
      setScale(scale >= MAX_SCALE ? MIN_SCALE : scale + 1.5, event.clientX - rect.left, event.clientY - rect.top);
    });

    // Move/up listeners live on window, not mapViewport — a fast drag can
    // easily carry the pointer outside the map's small bounds mid-gesture,
    // and tracking only stops when this pointerId lets go, wherever that
    // happens to be. No scale gate either: a drag attempt at 1x is a
    // harmless no-op (clampPan pins tx/ty to 0 since there's nothing to
    // pan yet), so it never needs to silently do nothing on pointerdown.
    let activePointerId = null;

    const onPointerMove = (event) => {
      if (!dragging || event.pointerId !== activePointerId) return;
      tx += event.clientX - lastX;
      ty += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      clampPan();
      applyTransform();
    };

    const endDrag = (event) => {
      if (!dragging || event.pointerId !== activePointerId) return;
      dragging = false;
      activePointerId = null;
      mapViewport.classList.remove('is-dragging');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };

    mapViewport.addEventListener('pointerdown', (event) => {
      // The zoom buttons sit inside .map-viewport (top-right overlay), so
      // pressing them also bubbles a pointerdown up to this handler. Without
      // this guard, preventDefault() + starting a drag here interferes with
      // the button's own click firing correctly — that's what made "-"
      // zoom in instead of out (same fate for the reset button).
      if (event.target.closest('.map-zoom-controls')) return;
      event.preventDefault();
      dragging = true;
      activePointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      mapViewport.classList.add('is-dragging');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    });

    document.querySelector('[data-map-zoom-in]')?.addEventListener('click', () => setScale(scale + 0.5));
    document.querySelector('[data-map-zoom-out]')?.addEventListener('click', () => setScale(scale - 0.5));
    document.querySelector('[data-map-zoom-reset]')?.addEventListener('click', () => setScale(MIN_SCALE));
  }
}

// The Park button lives inside the same panel as the live dino's stats, so
// it's normally hidden along with everything else once the dino is gone —
// but SetHealth(0) (what parking does server-side) doesn't despawn the pawn
// instantly, so /api/live-dino can keep reporting `found: true` with
// health 0 for a window after a dino is already parked, right up until the
// client actually reaches character select. During that window the panel
// (and an untouched button) would stay visible and clickable, inviting
// spam-parks of the same already-parked dino. Disable it once health hits
// 0 — skipped while a request is already in flight so this never fights
// requestActionAndPoll's own button-state management mid-click.
const PARK_BUTTON_BUSY_LABELS = new Set(['Requesting…', 'Waiting for in-game…']);

// Mirrors main.lua's own PARK_MIN_HEALTH_PCT gate (tryPark rejects a park
// below this regardless) — disabling the button proactively here is pure
// UX, the server-side check is the real enforcement either way.
const PARK_MIN_HEALTH_PCT = 99.99;

const updateParkButtonForLiveState = (healthPct) => {
  const btn = document.querySelector('[data-park-dino]');
  if (!btn || PARK_BUTTON_BUSY_LABELS.has(btn.textContent)) return;
  if (healthPct <= 0) {
    btn.disabled = true;
    btn.textContent = 'Dino not alive';
    return;
  }
  const canPark = healthPct >= PARK_MIN_HEALTH_PCT;
  btn.disabled = !canPark;
  btn.textContent = canPark ? 'Park Dino' : 'Heal up to park';
};

// Mirrors the game's own bIsGrowthPaused range: pausable only from 50%
// through 99% growth (never at 100%, and never before 50%).
const GROWTH_PAUSE_MIN = 0.5;
const GROWTH_PAUSE_MAX = 0.99;
const GROWTH_PAUSE_BUSY_LABELS = new Set(['Requesting…', 'Waiting for in-game…']);

const updateGrowthPauseButtonForLiveState = (isAlive, growth, paused) => {
  const btn = document.querySelector('[data-growth-pause]');
  if (!btn || GROWTH_PAUSE_BUSY_LABELS.has(btn.textContent)) return;
  btn.dataset.pausedState = paused ? 'true' : 'false';
  if (!isAlive) {
    btn.disabled = true;
    btn.textContent = paused ? 'Resume Growth' : 'Pause Growth';
    return;
  }
  if (paused) {
    btn.disabled = false;
    btn.textContent = 'Resume Growth';
    return;
  }
  btn.disabled = !(growth >= GROWTH_PAUSE_MIN && growth <= GROWTH_PAUSE_MAX);
  btn.textContent = 'Pause Growth';
};

// Mirrors the game's own 75% growth lock-in for Prime eligibility (see
// EVRIMA_Prime_Elder_Mechanism.md) — only offered below that threshold.
const SET_PRIME_GROWTH_CEILING = 0.75;
const SET_PRIME_BUSY_LABELS = new Set(['Requesting…', 'Waiting for in-game…']);

const updateSetPrimeButtonForLiveState = (isAlive, growth, isPrime) => {
  const btn = document.querySelector('[data-set-prime]');
  if (!btn || SET_PRIME_BUSY_LABELS.has(btn.textContent)) return;
  if (isPrime) {
    btn.disabled = true;
    btn.textContent = 'Already Prime';
    return;
  }
  btn.disabled = !isAlive || growth >= SET_PRIME_GROWTH_CEILING;
  btn.textContent = 'Set Prime (Bypass)';
};

const renderLiveDino = (dino) => {
  updateParkButtonForLiveState((dino.health || 0) * 100);
  updateGrowthPauseButtonForLiveState((dino.health || 0) > 0, dino.growth || 0, Boolean(dino.growthPaused));
  updateSetPrimeButtonForLiveState((dino.health || 0) > 0, dino.growth || 0, Boolean(dino.primeElder));

  // querySelectorAll, not querySelector — the same stat/name/prime markup
  // is duplicated in the compact strip under the map (see index.html's
  // map-dino-strip), so every matching element (main card + map strip)
  // stays in sync from one poll instead of only updating whichever one
  // querySelector happened to find first.
  document.querySelectorAll('[data-dino-class]').forEach((el) => { el.textContent = dino.class || 'Unknown'; });
  document.querySelectorAll('[data-dino-name]').forEach((el) => { el.textContent = dino.name || 'Unnamed'; });
  document.querySelectorAll('[data-dino-prime]').forEach((el) => { el.hidden = !dino.primeElder; });

  // Hunger/thirst under 20% get a red, pulsing treatment everywhere they're
  // shown (main card, the mini-strip under the map, and the plain-numbers
  // sidebar) — all three share these same data-dino-bar/data-dino-value
  // attributes, so one querySelectorAll pass covers every location.
  const CRITICAL_STAT_THRESHOLD = 20;
  ['growth', 'health', 'stamina', 'hunger', 'thirst'].forEach((stat) => {
    const percent = Math.round((dino[stat] || 0) * 100);
    const clamped = Math.min(100, Math.max(0, percent));
    const isCritical = (stat === 'hunger' || stat === 'thirst') && clamped < CRITICAL_STAT_THRESHOLD;
    document.querySelectorAll(`[data-dino-bar="${stat}"]`).forEach((bar) => {
      bar.style.width = `${clamped}%`;
      bar.classList.toggle('stat-critical', isCritical);
    });
    // Paused growth gets 3-decimal precision so a player can see exactly
    // where they froze it — the bar above still uses the rounded value,
    // this is purely the text label. Every other stat (and growth while
    // still moving) stays a plain rounded whole number.
    const preciseGrowthPaused = stat === 'growth' && dino.growthPaused;
    const displayText = preciseGrowthPaused
      ? `${Math.min(100, Math.max(0, (dino.growth || 0) * 100)).toFixed(3)}%`
      : `${clamped}%`;
    document.querySelectorAll(`[data-dino-value="${stat}"]`).forEach((value) => {
      value.textContent = displayText;
      value.classList.toggle('stat-critical', isCritical);
    });
  });

  const location = dino.location || {};
  ['x', 'y', 'z'].forEach((axis) => {
    const el = document.querySelector(`[data-dino-pos="${axis}"]`);
    if (el) el.textContent = Math.round(location[axis] || 0).toLocaleString();
  });
  updateMapMarker(location);

  setDinoView('live');
};

const pollLiveDino = async () => {
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    setDinoView('signed-out');
    return;
  }

  try {
    const response = await fetch(`/api/live-dino?steam_id=${encodeURIComponent(profile.steamId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json();

    if (data.found) {
      // RCON's PlayerData command is a fixed protocol we don't control and
      // doesn't carry the growth-paused flag — main.lua writes it to its
      // own status file every poll tick instead (see growth-status.js).
      try {
        const statusResponse = await fetch(`/api/growth-status?steamId=${encodeURIComponent(profile.steamId)}`);
        const statusData = await statusResponse.json();
        data.growthPaused = Boolean(statusData.paused);
      } catch (error) {
        console.debug('Growth status poll failed:', error);
      }
      renderLiveDino(data);
    } else if (response.status === 404) {
      setDinoView('empty');
    } else {
      setDinoView('error', data.error || "Couldn't reach the server right now.");
    }
  } catch (error) {
    console.debug('Live dino poll failed:', error);
    setDinoView('error', "Couldn't reach the server right now.");
  }
};

let liveDinoPollingInterval = null;

const startLiveDinoPolling = () => {
  if (liveDinoPollingInterval) clearInterval(liveDinoPollingInterval);
  pollLiveDino();
  liveDinoPollingInterval = setInterval(pollLiveDino, 2000);
};

startLiveDinoPolling();

const ACTION_POLL_INTERVAL_MS = 2000;
const ACTION_POLL_TIMEOUT_MS = 20000;

// Shared by the Park button (Live Dino tab) and the per-card Redeem button
// (Inventory tab): POST to a bridge endpoint to queue an in-game action,
// then poll GET on the same endpoint for the mod's real result. Can't be
// instant — the mod only checks for a pending request every few seconds,
// and only while the player is online (which they must be to have clicked
// this at all). endpoint's GET variant is expected to take the same
// steamId/requestId query params every one of these bridge endpoints uses.
const requestActionAndPoll = async ({ endpoint, body, buttonEl, idleLabel, waitingLabel, onSuccess }) => {
  buttonEl.disabled = true;
  buttonEl.textContent = 'Requesting…';

  let requestId;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || !data.requestId) {
      showToast(data.error || 'Could not request that right now.');
      buttonEl.disabled = false;
      buttonEl.textContent = idleLabel;
      return;
    }
    requestId = data.requestId;
  } catch (error) {
    console.debug('Action request failed:', error);
    showToast('Could not request that right now.');
    buttonEl.disabled = false;
    buttonEl.textContent = idleLabel;
    return;
  }

  buttonEl.textContent = waitingLabel;
  const startedAt = Date.now();

  const poll = async () => {
    if (Date.now() - startedAt > ACTION_POLL_TIMEOUT_MS) {
      showToast("Didn't hear back — check in-game.");
      buttonEl.disabled = false;
      buttonEl.textContent = idleLabel;
      return;
    }
    try {
      const pollResponse = await fetch(
        `${endpoint}?steamId=${encodeURIComponent(body.steamId)}&requestId=${encodeURIComponent(requestId)}`,
      );
      const pollData = await pollResponse.json();
      if (pollData.ok === true) {
        showToast(pollData.message || 'Done!');
        onSuccess?.();
        buttonEl.disabled = false;
        buttonEl.textContent = idleLabel;
        return;
      }
      if (pollData.ok === false) {
        showToast(pollData.message || 'Failed.');
        buttonEl.disabled = false;
        buttonEl.textContent = idleLabel;
        return;
      }
    } catch (error) {
      console.debug('Action result poll failed:', error);
    }
    setTimeout(poll, ACTION_POLL_INTERVAL_MS);
  };
  setTimeout(poll, ACTION_POLL_INTERVAL_MS);
};

// Live Dino tab's Park button — same real in-game action as typing !park
// in chat (see functions/api/park.js -> the bridge Worker -> a
// park_request_<steamid>.json the mod's poll loop picks up).
document.querySelector('[data-park-dino]')?.addEventListener('click', (event) => {
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  const nameInput = document.querySelector('[data-park-name-input]');
  const name = nameInput?.value.trim() || '';
  requestActionAndPoll({
    endpoint: '/api/park',
    body: { steamId: profile.steamId, name },
    buttonEl: event.currentTarget,
    idleLabel: 'Park Dino',
    waitingLabel: 'Waiting for in-game…',
    onSuccess: () => {
      if (nameInput) nameInput.value = '';
      pollLiveDino(); // the dino just despawned; refresh so the tab reflects that
    },
  });
});

// Live Dino tab's Pause/Resume Growth button — toggles main.lua's
// bIsGrowthPaused write on the caller's own live dino (see
// functions/api/growth-pause.js). Whether to pause or resume is read off
// the button's own current label/state rather than tracked separately,
// since renderLiveDino already keeps that in sync every poll tick.
document.querySelector('[data-growth-pause]')?.addEventListener('click', (event) => {
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  const btn = event.currentTarget;
  const action = btn.dataset.pausedState === 'true' ? 'resume' : 'pause';
  requestActionAndPoll({
    endpoint: '/api/growth-pause',
    body: { steamId: profile.steamId, action },
    buttonEl: btn,
    idleLabel: action === 'pause' ? 'Pause Growth' : 'Resume Growth',
    waitingLabel: 'Waiting for in-game…',
    onSuccess: () => {
      pollLiveDino(); // refresh so the button reflects the new paused state
    },
  });
});

// Live Dino tab's Set Prime (Bypass) button — forces Prime status on the
// caller's own live dino, skipping the game's normal prime-condition
// requirements (see functions/api/set-prime.js / EVRIMA_Prime_Elder_Mechanism.md).
document.querySelector('[data-set-prime]')?.addEventListener('click', (event) => {
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  const btn = event.currentTarget;
  requestActionAndPoll({
    endpoint: '/api/set-prime',
    body: { steamId: profile.steamId },
    buttonEl: btn,
    idleLabel: 'Set Prime (Bypass)',
    waitingLabel: 'Waiting for in-game…',
    onSuccess: () => {
      pollLiveDino(); // refresh so the PRIME badge and button state update
    },
  });
});

// Inventory gallery — the signed-in player's own currently-parked dinos
// (scoped server-side by functions/api/parked-list.js, never anyone else's),
// synced from the game server by workers/bridge-worker.js's scheduled sync.
// Parking can happen in-game (!park, or the Live Dino tab's Park button
// above) or on this page; redeeming a SPECIFIC parked dino (rather than the
// most-recent same-species one !redeem picks) is done from a card here via
// functions/api/redeem.js — see requestRedeem, which now just calls the
// shared requestActionAndPoll helper defined above.
const parkedCountEl = document.querySelector('[data-parked-count]');
const parkedSearchEl = document.querySelector('[data-parked-search]');
const parkedSortEl = document.querySelector('[data-parked-sort]');
const parkedGridEl = document.querySelector('[data-parked-grid]');
const parkedSignedOutEl = document.querySelector('[data-parked-signed-out]');
const parkedEmptyEl = document.querySelector('[data-parked-empty]');
const parkedErrorEl = document.querySelector('[data-parked-error]');
const parkedErrorMessageEl = document.querySelector('[data-parked-error-message]');

let parkedEntries = [];

const speciesFromClassPath = (classPath) => {
  const match = /\/Dinosaurs\/([^/]+)\//.exec(classPath || '');
  return match ? match[1] : 'Unknown';
};

// Per-species card art. Species without an entry here fall back to the
// watermark placeholder — add more as art gets added to assets/Dino Art/.
const speciesArt = {
  Allosaurus: 'assets/Dino Art/allo.png',
  Stegosaurus: 'assets/Dino Art/stego.png',
  Triceratops: 'assets/Dino Art/trike.png',
};

const colorHex = (entry) => {
  const toByte = (v) => Math.max(0, Math.min(255, Math.round((Number(v) || 0) * 255)));
  const r = toByte(entry.bodyColorR).toString(16).padStart(2, '0');
  const g = toByte(entry.bodyColorG).toString(16).padStart(2, '0');
  const b = toByte(entry.bodyColorB).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`.toUpperCase();
};

const pct = (value, max) => {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((Number(value) || 0) / max) * 100)));
};

const buildStatRow = (label, className, value, max) => {
  const row = document.createElement('div');
  row.className = 'stat-bar-row';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;

  const track = document.createElement('div');
  track.className = 'stat-bar-track';
  const fill = document.createElement('div');
  fill.className = `stat-bar-fill ${className}`;
  fill.style.width = `${pct(value, max)}%`;
  track.appendChild(fill);

  const valueEl = document.createElement('strong');
  valueEl.textContent = `${pct(value, max)}%`;

  row.append(labelEl, track, valueEl);
  return row;
};

const buildParkedCard = (entry) => {
  const card = document.createElement('article');
  card.className = 'parked-card';

  const badges = document.createElement('div');
  badges.className = 'parked-card-badges';

  const badgesLeft = document.createElement('div');
  badgesLeft.className = 'parked-badges-left';
  if (entry.primeElder) {
    const prime = document.createElement('span');
    prime.className = 'parked-prime-badge';
    prime.textContent = 'Prime';
    badgesLeft.appendChild(prime);
  }
  if (entry.entombments) {
    // Visible before the player ever clicks in, per the ask — the full
    // mutation breakdown (which tiers/slots those entombments unlocked)
    // only shows once they open the zoomed-in modal below.
    const elder = document.createElement('span');
    elder.className = 'parked-elder-badge';
    elder.textContent = `Elder ×${entry.entombments}`;
    badgesLeft.appendChild(elder);
  }
  badges.appendChild(badgesLeft);

  const colorBadge = document.createElement('span');
  colorBadge.className = 'parked-color-badge';
  const dot = document.createElement('span');
  dot.className = 'parked-color-dot';
  dot.style.background = colorHex(entry);
  const hexLabel = document.createElement('span');
  hexLabel.textContent = colorHex(entry);
  colorBadge.append(dot, hexLabel);
  badges.appendChild(colorBadge);

  const image = document.createElement('div');
  image.className = 'parked-card-image';
  const artSrc = speciesArt[entry.species];
  if (artSrc) {
    const img = document.createElement('img');
    img.src = artSrc;
    img.alt = entry.species;
    img.loading = 'lazy';
    image.appendChild(img);
  } else {
    const imageLabel = document.createElement('span');
    imageLabel.textContent = entry.species; // placeholder watermark until art exists for this species
    image.appendChild(imageLabel);
  }

  const species = document.createElement('p');
  species.className = 'parked-species';
  species.textContent = entry.species;

  const titleRow = document.createElement('div');
  titleRow.className = 'parked-title-row';
  const name = document.createElement('h3');
  name.className = 'parked-name';
  name.textContent = entry.name || 'ayoo gimme a name son';
  name.classList.toggle('is-placeholder', !entry.name);
  const growthValue = document.createElement('span');
  growthValue.className = 'parked-growth-value';
  const growthPercentLabel = document.createElement('small');
  growthPercentLabel.textContent = '%';
  growthValue.append(`${Math.round((entry.growth || 0) * 100)}`, growthPercentLabel);
  titleRow.append(name, growthValue);

  const growthBar = document.createElement('div');
  growthBar.className = 'stat-bar-track';
  const growthFill = document.createElement('div');
  growthFill.className = 'stat-bar-fill stat-growth';
  growthFill.style.width = `${Math.round((entry.growth || 0) * 100)}%`;
  growthBar.appendChild(growthFill);

  const stats = document.createElement('div');
  stats.className = 'parked-stats';
  stats.append(
    buildStatRow('Health', 'stat-health', entry.health, entry.maxHealth),
    buildStatRow('Stamina', 'stat-stamina', entry.stamina, entry.maxStamina),
    buildStatRow('Hunger', 'stat-hunger', entry.hunger, entry.maxHunger),
    buildStatRow('Thirst', 'stat-thirst', entry.thirst, entry.maxThirst),
  );

  card.append(badges, image, species, titleRow, growthBar, stats);
  card.addEventListener('click', () => openParkedDinoModal(entry));
  return card;
};

const mutationSlotShortLabel = (field) => {
  const match = field.match(/(\d[AB]?)$/);
  return match ? `Slot ${match[1]}` : field;
};

// Same field-name -> human label extraction as mutationSlotShortLabel
// above, just worded for the Compensation form's slot labels
// specifically ("Mutation 1:" instead of the raw internal field name
// like "mutationSlot1").
const compMutationSlotLabel = (field) => {
  const match = field.match(/(\d[AB]?)$/);
  return match ? `Mutation ${match[1]}:` : field;
};

const parkedModalOverlay = document.querySelector('[data-parked-modal]');
const parkedModalContent = document.querySelector('[data-parked-modal-content]');

const closeParkedModal = () => {
  if (parkedModalOverlay) parkedModalOverlay.hidden = true;
  if (parkedModalContent) parkedModalContent.innerHTML = '';
};

document.querySelector('[data-parked-modal-close]')?.addEventListener('click', closeParkedModal);
parkedModalOverlay?.addEventListener('click', (event) => {
  if (event.target === parkedModalOverlay) closeParkedModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && parkedModalOverlay && !parkedModalOverlay.hidden) closeParkedModal();
});

// The "zoomed in" detail view — bigger card, full stat numbers, every
// unlocked mutation slot (so a player can actually tell parked dinos of
// the same species apart before picking which one to redeem), and the
// rename/redeem/release actions that used to live inline on the grid card.
const openParkedDinoModal = (entry) => {
  if (!parkedModalOverlay || !parkedModalContent) return;
  parkedModalContent.innerHTML = '';

  const image = document.createElement('div');
  image.className = 'parked-modal-image';
  const artSrc = speciesArt[entry.species];
  if (artSrc) {
    const img = document.createElement('img');
    img.src = artSrc;
    img.alt = entry.species;
    image.appendChild(img);
  } else {
    const label = document.createElement('span');
    label.textContent = entry.species;
    image.appendChild(label);
  }

  const species = document.createElement('p');
  species.className = 'parked-species';
  species.textContent = entry.species;

  const titleRow = document.createElement('div');
  titleRow.className = 'parked-title-row';
  const name = document.createElement('h3');
  name.className = 'parked-name';
  name.textContent = entry.name || 'ayoo gimme a name son';
  name.classList.toggle('is-placeholder', !entry.name);
  const growthValue = document.createElement('span');
  growthValue.className = 'parked-growth-value';
  const growthPercentLabel = document.createElement('small');
  growthPercentLabel.textContent = '%';
  growthValue.append(`${Math.round((entry.growth || 0) * 100)}`, growthPercentLabel);
  titleRow.append(name, growthValue);

  const growthBar = document.createElement('div');
  growthBar.className = 'stat-bar-track';
  const growthFill = document.createElement('div');
  growthFill.className = 'stat-bar-fill stat-growth';
  growthFill.style.width = `${Math.round((entry.growth || 0) * 100)}%`;
  growthBar.appendChild(growthFill);

  const stats = document.createElement('div');
  stats.className = 'parked-stats';
  stats.append(
    buildStatRow('Health', 'stat-health', entry.health, entry.maxHealth),
    buildStatRow('Stamina', 'stat-stamina', entry.stamina, entry.maxStamina),
    buildStatRow('Hunger', 'stat-hunger', entry.hunger, entry.maxHunger),
    buildStatRow('Thirst', 'stat-thirst', entry.thirst, entry.maxThirst),
  );

  const detailStats = document.createElement('dl');
  detailStats.className = 'parked-detail-stats';
  const addDetail = (label, value) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    detailStats.append(dt, dd);
  };
  addDetail('Health', `${Math.round(entry.health || 0)} / ${Math.round(entry.maxHealth || 0)}`);
  addDetail('Stamina', `${Math.round(entry.stamina || 0)} / ${Math.round(entry.maxStamina || 0)}`);
  addDetail('Hunger', `${Math.round(entry.hunger || 0)} / ${Math.round(entry.maxHunger || 0)}`);
  addDetail('Thirst', `${Math.round(entry.thirst || 0)} / ${Math.round(entry.maxThirst || 0)}`);
  addDetail('Parked', entry.capturedAt ? new Date(entry.capturedAt * 1000).toLocaleString() : 'Unknown');
  if (entry.compCode) addDetail('Reference #', entry.compCode);
  if (entry.skin) addDetail('Skin', entry.skin.name || 'Attached');
  // Unconditional (unlike the card's Elder badge, which only shows above 0
  // to avoid grid clutter) — this confirms the tracking is actually active
  // for players still growing toward their first entomb, rather than
  // looking like the feature is just missing.
  addDetail('Elder stacks', String(entry.entombments || 0));

  parkedModalContent.append(image, species, titleRow, growthBar, stats, detailStats);

  // Redeeming/renaming/releasing/editing someone else's dino makes no
  // sense, so all of those are only offered for the viewer's own cards.
  // The API still only trusts the client-supplied steamId either way —
  // same trust model the rest of this site already uses.
  const viewerSteamId = getSteamProfile()?.steamId;
  const isOwner = Boolean(entry.steam && viewerSteamId && entry.steam === viewerSteamId);

  // Mutation slots, grouped by tier, limited to whatever this dino's own
  // entombment level actually unlocked — mutationSlotTiers/MUTATION_TIER_LABELS
  // are the same ones loadMutationCatalog() already fetches for the
  // Compensation form (no admin gate on that endpoint, so it's populated
  // for every signed-in visitor already). A FILLED slot only ever got
  // there by being actually equipped live in-game (captured on !park) or
  // by an admin's Compensation grant — both legitimate, so the owner can
  // reassign which specific mutation sits there. An EMPTY slot was never
  // earned by either path, so it's shown locked rather than editable —
  // this endpoint has no way to grant a brand-new mutation for free.
  const entombments = entry.entombments || 0;
  const allMutationFields = mutationSlotTiers.flat();
  const hasAnyMutation = entombments > 0 || allMutationFields.some((field) => entry[field]);
  if (mutationSlotTiers.length > 0 && hasAnyMutation) {
    mutationSlotTiers.slice(0, entombments + 1).forEach((fields, tierIndex) => {
      const heading = document.createElement('div');
      heading.className = 'parked-modal-mutation-tier';
      heading.textContent = `${MUTATION_TIER_LABELS[tierIndex] || 'Tier'} mutations`;
      const grid = document.createElement('div');
      grid.className = 'parked-modal-mutation-grid';
      fields.forEach((field) => {
        const value = entry[field];
        const filled = Boolean(value);
        const slot = document.createElement('div');
        slot.className = `parked-modal-mutation-slot${filled ? '' : ' is-empty'}`;
        const label = document.createElement('small');
        label.textContent = mutationSlotShortLabel(field);
        slot.appendChild(label);

        if (!filled) {
          slot.append('LOCKED');
          grid.appendChild(slot);
          return;
        }

        if (!isOwner) {
          slot.append(value);
          grid.appendChild(slot);
          return;
        }

        const select = document.createElement('select');
        select.className = 'parked-modal-mutation-select';
        mutationCatalog
          .filter((m) => mutationAllowedForSpecies(m.diet, entry.species))
          .forEach((m) => {
            const option = document.createElement('option');
            option.value = m.name;
            option.textContent = m.name;
            option.selected = m.name === value;
            select.appendChild(option);
          });
        // The dino's current mutation might not be in the filtered list
        // (a diet tag corrected after this was granted, say) — keep it
        // selectable rather than silently swapping it out from under the
        // player the moment they open the modal.
        if (!Array.from(select.options).some((opt) => opt.value === value)) {
          const currentOption = document.createElement('option');
          currentOption.value = value;
          currentOption.textContent = value;
          currentOption.selected = true;
          select.prepend(currentOption);
        }
        const previousValue = value;
        select.addEventListener('click', (event) => event.stopPropagation());
        select.addEventListener('change', async () => {
          const newValue = select.value;
          select.disabled = true;
          try {
            const response = await fetch('/api/edit-parked-mutation', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                steamId: entry.steam,
                requesterSteamId: viewerSteamId,
                snapshotId: entry.capturedAt,
                field,
                mutationName: newValue,
              }),
            });
            const data = await response.json();
            if (!response.ok || !data.ok) {
              showToast(data.error || 'Could not update that mutation.');
              select.value = previousValue;
            } else {
              entry[field] = newValue;
              showToast(`${mutationSlotShortLabel(field)} set to ${newValue}.`);
            }
          } catch (error) {
            console.debug('Mutation edit failed:', error);
            showToast('Could not reach the server right now.');
            select.value = previousValue;
          } finally {
            select.disabled = false;
          }
        });
        slot.appendChild(select);
        grid.appendChild(slot);
      });
      parkedModalContent.append(heading, grid);
    });
  }

  if (isOwner) {
    const renameRow = document.createElement('div');
    renameRow.className = 'parked-rename-row';

    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.maxLength = 24;
    renameInput.placeholder = 'ayoo gimme a name son';
    renameInput.value = entry.name || '';
    renameInput.className = 'parked-rename-input';

    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.className = 'action-button small';
    renameButton.textContent = 'Save name';
    renameButton.addEventListener('click', async () => {
      const newName = renameInput.value.trim();
      renameButton.disabled = true;
      try {
        const response = await fetch('/api/rename-parked-dino', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            steamId: entry.steam,
            requesterSteamId: viewerSteamId,
            snapshotId: entry.capturedAt,
            name: newName,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          showToast(data.error || 'Could not rename that dino.');
        } else {
          entry.name = newName;
          name.textContent = newName || 'ayoo gimme a name son';
          name.classList.toggle('is-placeholder', !newName);
          showToast('Name updated.');
        }
      } catch (error) {
        console.debug('Rename failed:', error);
        showToast('Could not reach the server right now.');
      } finally {
        renameButton.disabled = false;
      }
    });
    renameRow.append(renameInput, renameButton);
    parkedModalContent.appendChild(renameRow);

    const redeemButton = document.createElement('button');
    redeemButton.type = 'button';
    redeemButton.className = 'action-button small parked-redeem-button';
    redeemButton.textContent = 'Redeem';
    redeemButton.addEventListener('click', () => requestRedeem(entry, redeemButton));
    parkedModalContent.appendChild(redeemButton);

    const releaseButton = document.createElement('button');
    releaseButton.type = 'button';
    releaseButton.className = 'action-button small parked-release-button';
    releaseButton.textContent = 'Release to the wild';
    releaseButton.addEventListener('click', async () => {
      const confirmLabel = entry.name ? `${entry.species} ("${entry.name}")` : entry.species;
      if (!window.confirm(`Release this ${confirmLabel}? This can't be undone.`)) return;
      releaseButton.disabled = true;
      try {
        const response = await fetch('/api/release-parked-dino', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            steamId: entry.steam,
            requesterSteamId: viewerSteamId,
            snapshotId: entry.capturedAt,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          showToast(data.error || 'Could not release that dino.');
          releaseButton.disabled = false;
          return;
        }
        showToast('Dino released.');
        parkedEntries = parkedEntries.filter(
          (e) => !(e.steam === entry.steam && e.capturedAt === entry.capturedAt),
        );
        renderParkedGrid();
        closeParkedModal();
      } catch (error) {
        console.debug('Release failed:', error);
        showToast('Could not reach the server right now.');
        releaseButton.disabled = false;
      }
    });
    parkedModalContent.appendChild(releaseButton);
  }

  parkedModalOverlay.hidden = false;
};

// Asks the mod (via functions/api/redeem.js -> the bridge Worker -> a
// redeem_request_<steamid>.json the mod's poll loop picks up) to redeem this
// exact snapshot, then polls for the mod's real result via the shared
// requestActionAndPoll helper (defined up in the Live Dino section, which
// uses it too for the Park button).
const requestRedeem = (entry, buttonEl) => requestActionAndPoll({
  endpoint: '/api/redeem',
  body: { steamId: entry.steam, snapshotId: entry.capturedAt },
  buttonEl,
  idleLabel: 'Redeem',
  waitingLabel: 'Waiting for in-game…',
  onSuccess: () => {
    parkedEntries = parkedEntries.filter(
      (e) => !(e.steam === entry.steam && e.capturedAt === entry.capturedAt),
    );
    renderParkedGrid();
    closeParkedModal();
  },
});

const renderParkedGrid = () => {
  const query = (parkedSearchEl?.value || '').trim().toLowerCase();
  const sort = parkedSortEl?.value || 'recent';

  let visible = parkedEntries;
  if (query) {
    visible = visible.filter((entry) =>
      entry.species.toLowerCase().includes(query) || (entry.name || '').toLowerCase().includes(query));
  }

  visible = [...visible].sort((a, b) => {
    if (sort === 'growth') return (b.growth || 0) - (a.growth || 0);
    if (sort === 'name') return (a.name || a.species).localeCompare(b.name || b.species);
    return (b.capturedAt || 0) - (a.capturedAt || 0);
  });

  if (parkedCountEl) parkedCountEl.textContent = `${parkedEntries.length} parked`;
  if (parkedEmptyEl) parkedEmptyEl.hidden = parkedEntries.length !== 0;
  if (parkedGridEl) {
    parkedGridEl.innerHTML = '';
    visible.forEach((entry) => parkedGridEl.appendChild(buildParkedCard(entry)));
  }
};

// Scoped to the signed-in player's own steam_id — the server only ever
// returns that player's parked dinos (see functions/api/parked-list.js),
// so nobody sees or can attempt to redeem anyone else's.
const loadParkedList = async () => {
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    if (parkedSignedOutEl) parkedSignedOutEl.hidden = false;
    if (parkedEmptyEl) parkedEmptyEl.hidden = true;
    if (parkedErrorEl) parkedErrorEl.hidden = true;
    if (parkedGridEl) parkedGridEl.innerHTML = '';
    if (parkedCountEl) parkedCountEl.textContent = '0 parked';
    parkedEntries = [];
    return;
  }
  if (parkedSignedOutEl) parkedSignedOutEl.hidden = true;

  try {
    const response = await fetch(`/api/parked-list?steam_id=${encodeURIComponent(profile.steamId)}`);
    const data = await response.json();
    if (!response.ok) {
      if (parkedErrorEl) parkedErrorEl.hidden = false;
      if (parkedErrorMessageEl) parkedErrorMessageEl.textContent = data.error || "Couldn't reach the server right now.";
      return;
    }
    if (parkedErrorEl) parkedErrorEl.hidden = true;
    // Each value already carries its own "steam" field (added by the bridge
    // Worker when flattening) and "capturedAt" (its snapshot id) — the KV
    // object's key is just `${steam}_${capturedAt}` for uniqueness, not
    // meant to be parsed, so this reads values only.
    parkedEntries = Object.values(data.parked || {}).map((entry) => ({
      ...entry,
      species: speciesFromClassPath(entry.classPath),
    }));
    renderParkedGrid();
  } catch (error) {
    console.debug('Parked list load failed:', error);
    if (parkedErrorEl) parkedErrorEl.hidden = false;
    if (parkedErrorMessageEl) parkedErrorMessageEl.textContent = "Couldn't reach the server right now.";
  }
};

parkedSearchEl?.addEventListener('input', renderParkedGrid);
parkedSortEl?.addEventListener('change', renderParkedGrid);
document.querySelector('[data-tab="inventory"]')?.addEventListener('click', loadParkedList);
loadParkedList();

// ── Inventory: skin charges ──
//
// A separate grid from parked dinos, same rectangle-card look
// (.parked-card reused directly — "rectangles like inventory cards" is
// the whole point). Each card offers both ways to spend a charge: apply
// to the player's current live dino (reuses requestActionAndPoll, same
// shared request+poll UX Park/Redeem already use), or attach to one
// specific parked dino from a dropdown built off parkedEntries (already
// scoped to just this viewer, loaded by loadParkedList above).
const skinsGridEl = document.querySelector('[data-skins-grid]');
const skinsSignedOutEl = document.querySelector('[data-skins-signed-out]');
const skinsEmptyEl = document.querySelector('[data-skins-empty]');

let skinEntries = [];

const buildSkinCard = (skin) => {
  const card = document.createElement('article');
  card.className = 'parked-card skin-card';

  const header = document.createElement('div');
  header.className = 'skin-card-header';
  const name = document.createElement('h3');
  name.className = 'skin-card-name';
  name.textContent = skin.name || 'Unnamed skin';
  const charges = document.createElement('span');
  charges.className = 'skin-card-charges';
  const chargesStrong = document.createElement('strong');
  chargesStrong.textContent = String(skin.charges || 0);
  charges.append(chargesStrong, ` charge${(skin.charges || 0) === 1 ? '' : 's'}`);
  header.append(name, charges);

  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  applyButton.className = 'action-button small';
  applyButton.textContent = 'Apply to live dino';
  applyButton.addEventListener('click', () => {
    const steamId = getSteamProfile()?.steamId;
    if (!steamId) {
      showToast('Sign in with Steam first.');
      return;
    }
    requestActionAndPoll({
      endpoint: '/api/skin-use',
      body: { steamId, skinCode: skin.code },
      buttonEl: applyButton,
      idleLabel: 'Apply to live dino',
      waitingLabel: 'Waiting for in-game…',
      onSuccess: () => loadSkinCharges(),
    });
  });

  const attachRow = document.createElement('div');
  attachRow.className = 'skin-attach-row';
  const select = document.createElement('select');
  const viewerSteamId = getSteamProfile()?.steamId;
  const ownDinos = parkedEntries.filter((entry) => entry.steam === viewerSteamId);
  if (ownDinos.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'No parked dinos to attach to';
    option.disabled = true;
    select.appendChild(option);
  } else {
    ownDinos.forEach((entry) => {
      const option = document.createElement('option');
      option.value = String(entry.capturedAt);
      const label = entry.name ? `${entry.name} (${entry.species})` : entry.species;
      option.textContent = entry.skin ? `${label} — already skinned` : label;
      select.appendChild(option);
    });
  }
  const attachButton = document.createElement('button');
  attachButton.type = 'button';
  attachButton.className = 'action-button small';
  attachButton.textContent = 'Attach';
  attachButton.disabled = ownDinos.length === 0;
  attachButton.addEventListener('click', async () => {
    const steamId = getSteamProfile()?.steamId;
    if (!steamId) {
      showToast('Sign in with Steam first.');
      return;
    }
    const snapshotId = Number(select.value);
    if (!snapshotId) return;
    attachButton.disabled = true;
    try {
      const response = await fetch('/api/skin-attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId, snapshotId, skinCode: skin.code }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        showToast(data.error || 'Could not attach that skin.');
        attachButton.disabled = false;
        return;
      }
      showToast('Skin attached — applies next time that dino is redeemed.');
      await loadParkedList();
      await loadSkinCharges();
    } catch (error) {
      console.debug('Skin attach failed:', error);
      showToast('Could not reach the server right now.');
      attachButton.disabled = false;
    }
  });
  attachRow.append(select, attachButton);

  card.append(header, applyButton, attachRow);
  return card;
};

const renderSkinsGrid = () => {
  if (skinsEmptyEl) skinsEmptyEl.hidden = skinEntries.length !== 0;
  if (skinsGridEl) {
    skinsGridEl.innerHTML = '';
    skinEntries.forEach((skin) => skinsGridEl.appendChild(buildSkinCard(skin)));
  }
};

const loadSkinCharges = async () => {
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    if (skinsSignedOutEl) skinsSignedOutEl.hidden = false;
    if (skinsEmptyEl) skinsEmptyEl.hidden = true;
    if (skinsGridEl) skinsGridEl.innerHTML = '';
    skinEntries = [];
    return;
  }
  if (skinsSignedOutEl) skinsSignedOutEl.hidden = true;

  try {
    const response = await fetch(`/api/skin-charges?steamId=${encodeURIComponent(profile.steamId)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      skinEntries = [];
      renderSkinsGrid();
      return;
    }
    skinEntries = data.skins || [];
    renderSkinsGrid();
  } catch (error) {
    console.debug('Skin charges load failed:', error);
  }
};

document.querySelector('[data-tab="inventory"]')?.addEventListener('click', loadSkinCharges);
loadSkinCharges();

// ── Admin Panel: compensation + strikes ──
//
// Gated to whoever's in admin_tiers.json (any tier — owner/senior/admin),
// synced by the bridge Worker's cron into KV and checked here via
// /api/admin-status. The tab itself is just a UI reveal; the actual writes
// (/api/compensation, /api/strikes) re-validate tier server-side on the
// Worker regardless of whether this check ever ran, same trust model as
// every other write path on this site.
const ADMIN_PANEL_SPECIES = [
  'Allosaurus', 'Austroraptor', 'Beipiaosaurus', 'Carnotaurus', 'Ceratosaurus',
  'Deinosuchus', 'Diabloceratops', 'Dilophosaurus', 'Dryosaurus', 'Gallimimus',
  'Herrerasaurus', 'Hypsilophodon', 'Kentrosaurus', 'Maiasaura', 'Omniraptor',
  'Pachycephalosaurus', 'Pteranodon', 'Stegosaurus', 'Tenontosaurus',
  'Triceratops', 'Troodon', 'Tyrannosaurus',
];

const compSpeciesSelect = document.querySelector('[data-comp-species]');
if (compSpeciesSelect) {
  compSpeciesSelect.innerHTML = ADMIN_PANEL_SPECIES
    .map((species) => `<option value="${species}">${species}</option>`)
    .join('');
}

// Name-search autocomplete for the 3 target-steamId fields below. Backed
// by a plain array fetched from the game server's own join logs (there's
// no Steam API for searching by name) and rendered as a custom dropdown
// rather than a native <datalist> — datalist's substring-matching behavior
// is inconsistent across browsers (several only match from the start of
// the name), and it offers no way to auto-fill the input with something
// other than the option's own display text. This version matches on any
// substring (e.g. "pook" finds "AyoPooks") and fills the input with the
// actual steamId the moment a suggestion is picked.
let playerDirectory = [];

const loadPlayerDirectory = async () => {
  const profile = getSteamProfile();
  if (!profile?.steamId) return;
  try {
    const response = await fetch(`/api/player-directory?requesterSteamId=${encodeURIComponent(profile.steamId)}`);
    const data = await response.json();
    if (response.ok && Array.isArray(data.players)) playerDirectory = data.players;
  } catch (error) {
    console.debug('Player directory load failed:', error);
  }
};

const extractSteamId = (rawValue) => (rawValue || '').trim();

// One shared dropdown, portalled directly onto <body> rather than living
// inside each field's own .player-search wrapper. Every .panel sets
// backdrop-filter, which creates its own CSS stacking context — a nested
// position:absolute child's z-index only ever wins against siblings
// INSIDE that same panel, never against a separate sibling panel later in
// the DOM (a real reported bug: the Friends tab's "Friend Requests" panel
// was covering the "Add a Friend" dropdown right above it). position:fixed
// with coordinates computed from the input's own getBoundingClientRect()
// sidesteps the stacking-context trap entirely instead of fighting it
// panel by panel.
const playerSuggestionsPortal = document.createElement('div');
playerSuggestionsPortal.className = 'player-suggestions';
playerSuggestionsPortal.hidden = true;
document.body.appendChild(playerSuggestionsPortal);
let playerSuggestionsOwner = null;

const hidePlayerSuggestions = (forInput) => {
  if (forInput && playerSuggestionsOwner !== forInput) return;
  playerSuggestionsPortal.hidden = true;
  playerSuggestionsPortal.innerHTML = '';
  playerSuggestionsPortal.currentRerender = null;
  playerSuggestionsOwner = null;
};

// Closes on scroll rather than trying to track and re-position live —
// matches how most native/browser dropdowns behave, and avoids the
// dropdown visually drifting away from its input mid-scroll.
window.addEventListener('scroll', () => hidePlayerSuggestions(), true);

// Delegated once on the shared portal rather than per-field. mousedown
// (not click) fires before the input's blur, and preventDefault here
// stops that blur from happening at all — so this is the only thing that
// closes the dropdown, rather than a race between blur-hides-it and
// click-tries-to-read-it-first.
playerSuggestionsPortal.addEventListener('mousedown', (event) => {
  const removeBtn = event.target.closest('[data-remove-recent]');
  if (removeBtn) {
    event.preventDefault();
    event.stopPropagation();
    removeRecentPlayerSearch(removeBtn.dataset.removeRecent);
    playerSuggestionsPortal.currentRerender?.();
    return;
  }
  const row = event.target.closest('[data-steam-id]');
  if (!row || !playerSuggestionsOwner) return;
  event.preventDefault();
  playerSuggestionsOwner.value = row.dataset.steamId;
  recordRecentPlayerSearch(row.dataset.steamId, row.dataset.name || row.dataset.steamId);
  hidePlayerSuggestions();
});

// Last 3 players any admin searched/selected via one of the fields below,
// kept in localStorage (per-browser, not synced server-side — this is
// just a UI convenience, not data anyone else needs to see) so they show
// back up as one-click suggestions the next time that field is focused
// empty, instead of having to retype a name. Shared across every field
// attachPlayerAutocomplete is used on, since an admin picking a target
// for Compensation today is quite likely the same target they'll want
// for Strikes tomorrow.
const RECENT_PLAYER_SEARCHES_KEY = 'levels_recent_player_searches';
const MAX_RECENT_PLAYER_SEARCHES = 3;

const loadRecentPlayerSearches = () => {
  try {
    const raw = localStorage.getItem(RECENT_PLAYER_SEARCHES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const recordRecentPlayerSearch = (steamId, name) => {
  if (!steamId) return;
  try {
    const next = [{ steamId, name: name || steamId }, ...loadRecentPlayerSearches().filter((p) => p.steamId !== steamId)]
      .slice(0, MAX_RECENT_PLAYER_SEARCHES);
    localStorage.setItem(RECENT_PLAYER_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // best-effort — worst case this admin just doesn't get recent suggestions
  }
};

const removeRecentPlayerSearch = (steamId) => {
  try {
    const next = loadRecentPlayerSearches().filter((p) => p.steamId !== steamId);
    localStorage.setItem(RECENT_PLAYER_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // best-effort
  }
};

const escapePlayerSuggestionText = (str) => String(str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const attachPlayerAutocomplete = (inputEl) => {
  if (!inputEl) return;

  const renderSuggestions = () => {
    const query = inputEl.value.trim().toLowerCase();

    if (!query) {
      const recents = loadRecentPlayerSearches();
      if (recents.length === 0) {
        hidePlayerSuggestions(inputEl);
        return;
      }
      playerSuggestionsOwner = inputEl;
      const rect = inputEl.getBoundingClientRect();
      playerSuggestionsPortal.style.left = `${rect.left}px`;
      playerSuggestionsPortal.style.top = `${rect.bottom + 4}px`;
      playerSuggestionsPortal.style.width = `${rect.width}px`;
      playerSuggestionsPortal.innerHTML = `
        <div class="player-suggestions-heading">Recently searched</div>
        ${recents.map((p) => `
          <div class="player-suggestion player-suggestion-recent" data-steam-id="${p.steamId}" data-name="${escapePlayerSuggestionText(p.name)}">
            <span class="player-suggestion-label">
              ${escapePlayerSuggestionText(p.name)}
              <small>${p.steamId}</small>
            </span>
            <button type="button" class="player-suggestion-remove" data-remove-recent="${p.steamId}" aria-label="Remove ${escapePlayerSuggestionText(p.name)} from recent searches">×</button>
          </div>
        `).join('')}
      `;
      playerSuggestionsPortal.hidden = false;
      playerSuggestionsPortal.currentRerender = renderSuggestions;
      return;
    }

    if (/^\d+$/.test(query)) {
      hidePlayerSuggestions(inputEl);
      return;
    }
    const matches = playerDirectory
      .filter((p) => String(p.name || '').toLowerCase().includes(query))
      .slice(0, 8);
    if (matches.length === 0) {
      hidePlayerSuggestions(inputEl);
      return;
    }
    playerSuggestionsOwner = inputEl;
    const rect = inputEl.getBoundingClientRect();
    playerSuggestionsPortal.style.left = `${rect.left}px`;
    playerSuggestionsPortal.style.top = `${rect.bottom + 4}px`;
    playerSuggestionsPortal.style.width = `${rect.width}px`;
    playerSuggestionsPortal.innerHTML = matches.map((p) => `
      <div class="player-suggestion" data-steam-id="${p.steamId}" data-name="${escapePlayerSuggestionText(p.name)}">
        ${escapePlayerSuggestionText(p.name)}
        <small>${p.steamId}</small>
      </div>
    `).join('');
    playerSuggestionsPortal.hidden = false;
    playerSuggestionsPortal.currentRerender = renderSuggestions;
  };

  inputEl.addEventListener('input', renderSuggestions);
  inputEl.addEventListener('focus', renderSuggestions);
  inputEl.addEventListener('blur', () => {
    setTimeout(() => hidePlayerSuggestions(inputEl), 150);
  });
};

['[data-comp-target]', '[data-strike-target]', '[data-skin-target]', '[data-friend-target]', '[data-currency-target]', '[data-recover-target]'].forEach((selector) => {
  attachPlayerAutocomplete(document.querySelector(selector));
});

// Second factor gating the Admin Panel specifically (no other tab):
// each admin sets their own passkey the first time they open the panel,
// then re-enters it each session — unlocked for 35 minutes at a time
// (functions/_lib/session.js's ADMIN_UNLOCK_TTL_MS is the real,
// server-enforced cutoff; this timer just keeps the UI in sync with it
// rather than sitting there looking unlocked after it no longer is).
let adminUnlockExpiryTimer = null;
// Cached here so the chat right-click moderation menu (admin/owner only)
// doesn't need its own separate /api/admin-status round trip — it just
// reads whatever checkAdminPanelAccess() last resolved.
let viewerAdminTier = null;

const setAdminPanelGateState = (state) => {
  // 'hidden' (not an admin at all) | 'locked' (needs the passkey) | 'unlocked'
  const gate = document.querySelector('[data-admin-passkey-gate]');
  const content = document.querySelector('[data-admin-panel-content]');
  if (gate) gate.hidden = state !== 'locked';
  if (content) content.hidden = state !== 'unlocked';
};

const checkAdminPanelAccess = async () => {
  const adminPanelTabButton = document.querySelector('.admin-panel-tab-button');
  const adminPanelPanel = document.getElementById('admin-panel');
  const profile = getSteamProfile();
  if (adminUnlockExpiryTimer) {
    clearTimeout(adminUnlockExpiryTimer);
    adminUnlockExpiryTimer = null;
  }
  if (!profile?.steamId) {
    if (adminPanelTabButton) adminPanelTabButton.hidden = true;
    if (adminPanelPanel) adminPanelPanel.hidden = true;
    document.querySelectorAll('[data-owner-only]').forEach((el) => { el.hidden = true; });
    viewerAdminTier = null;
    return;
  }
  try {
    const response = await fetch('/api/admin-status');
    const data = await response.json();
    const hasAccess = Boolean(data.tier);
    viewerAdminTier = data.tier || null;
    if (adminPanelTabButton) adminPanelTabButton.hidden = !hasAccess;
    if (adminPanelPanel) adminPanelPanel.hidden = !hasAccess;
    // Skin Library management (save/delete) is owner-tier only — the
    // grant form's "Load from library" dropdown is separate and works for
    // any admin tier, wired up unconditionally in loadSkinLibrary().
    const isOwner = data.tier === 'owner';
    document.querySelectorAll('[data-owner-only]').forEach((el) => { el.hidden = !isOwner; });
    // renderHub() ran at page load before this async check resolved, so the
    // Admin Panel card wasn't in the grid yet for an actual admin — add it
    // in now that we know for sure.
    if (!hasAccess) {
      setAdminPanelGateState('hidden');
      return;
    }
    renderHub();

    if (data.unlocked) {
      setAdminPanelGateState('unlocked');
      loadSkinLibrary();
      loadOwnStaffBio();
      loadTransferLog();
      const statusEl = document.querySelector('[data-admin-unlock-status]');
      if (statusEl) {
        if (data.unlockExpiresAt) {
          statusEl.hidden = false;
          const until = new Date(data.unlockExpiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          statusEl.textContent = `Admin Panel unlocked — locks again at ${until}.`;
          const delay = data.unlockExpiresAt - Date.now();
          if (delay > 0) adminUnlockExpiryTimer = setTimeout(checkAdminPanelAccess, delay);
        } else {
          statusEl.hidden = true;
        }
      }
    } else {
      setAdminPanelGateState('locked');
      const form = document.querySelector('[data-admin-passkey-form]');
      const note = document.querySelector('[data-admin-passkey-note]');
      const submitBtn = document.querySelector('[data-admin-passkey-submit]');
      if (form) form.dataset.mode = data.hasPasskey ? 'unlock' : 'set';
      if (note) {
        note.textContent = data.hasPasskey
          ? 'Enter your admin passkey to use the Admin Panel.'
          : "Set a passkey to protect the Admin Panel — you'll enter it each time you use it, and it stays unlocked for 35 minutes.";
      }
      if (submitBtn) submitBtn.textContent = data.hasPasskey ? 'Unlock' : 'Set passkey';
    }
  } catch (error) {
    console.debug('Admin panel access check failed:', error);
  }
};

document.querySelector('[data-admin-passkey-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('[data-admin-passkey-input]');
  const passkey = input?.value || '';
  const mode = event.target.dataset.mode === 'set' ? 'set' : 'verify';
  const submitBtn = document.querySelector('[data-admin-passkey-submit]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const response = await fetch(`/api/admin-passkey-${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passkey }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showToast(data.error || 'Could not verify that passkey.');
      return;
    }
    if (input) input.value = '';
    showToast(mode === 'set' ? 'Admin passkey set — Admin Panel unlocked.' : 'Admin Panel unlocked.');
    checkAdminPanelAccess();
  } catch (error) {
    console.debug('Admin passkey submit failed:', error);
    showToast('Could not reach the server right now.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

document.querySelector('[data-admin-passkey-reset-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const targetInput = document.querySelector('[data-admin-passkey-reset-target]');
  const targetSteamId = extractSteamId(targetInput?.value);
  if (!/^\d{17}$/.test(targetSteamId)) {
    showToast('Enter a valid 17-digit Steam ID.');
    return;
  }
  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const response = await fetch('/api/admin-passkey-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetSteamId }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showToast(data.error || 'Could not reset that passkey.');
      return;
    }
    showToast('Passkey reset — they can set a new one next time they open the Admin Panel.');
    if (targetInput) targetInput.value = '';
  } catch (error) {
    console.debug('Admin passkey reset failed:', error);
    showToast('Could not reach the server right now.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

checkAdminPanelAccess();
// Now open to any signed-in player (not admin-gated server-side anymore)
// since the Friends tab's "Add a friend" field needs the same name-search
// lookup — loadPlayerDirectory() itself already no-ops for a signed-out
// visitor.
loadPlayerDirectory();
// A one-time load-at-page-open snapshot meant a staff member who kept the
// admin panel/Friends tab open for a while would never see a player who
// joined, linked Discord, or friended someone AFTER that snapshot was
// taken (a real reported bug — a connected, even staff-perm'd player was
// "not searchable" simply because their directory entry didn't exist yet
// when the page first loaded). Refreshed periodically so it eventually
// catches up without needing a manual page reload.
//
// This was originally set to 60s, which — combined with the Worker's
// /player-directory route calling env.PARKED_KV.list() live on every
// request at the time — guaranteed exceeding Cloudflare's separate,
// much stricter 1,000/day KV *list*-operation quota from a SINGLE open
// tab alone, taking /friends (and everything else sharing that quota)
// down with a hard 502 for the rest of the day (confirmed live). The
// Worker route no longer lists live (see syncUnnamedFriendSteamIds,
// throttled to its own 15-minute cron cycle), so this is safe again at
// a much longer interval — there's no benefit to polling faster than the
// underlying data actually refreshes anyway.
setInterval(loadPlayerDirectory, 5 * 60 * 1000);

// Compensation form: entombment level + the mutation slots it unlocks.
// Read-only catalog (no admin gate — see functions/api/mutations-catalog.js),
// so this can just load unconditionally alongside the rest of page init;
// it only ever gets used inside the admin-only form anyway.
let mutationCatalog = [];
let mutationSlotTiers = [];
let mutationSpeciesDiet = {};
const MUTATION_TIER_LABELS = ['Base', 'Parent', 'Elder A', 'Elder B'];

// Generic mutations are always eligible; an omnivore species (or a species
// this map doesn't recognize) is treated as eligible for either pool since
// there's no third diet bucket to restrict it to.
const mutationAllowedForSpecies = (mutationDiet, species) => {
  const speciesDiet = mutationSpeciesDiet[species] || 'omnivore';
  return mutationDiet === 'generic' || speciesDiet === 'omnivore' || mutationDiet === speciesDiet;
};

const renderMutationSlots = () => {
  const container = document.querySelector('[data-comp-mutation-slots]');
  const entombmentsSelect = document.querySelector('[data-comp-entombments]');
  const species = document.querySelector('[data-comp-species]')?.value;
  if (!container || !entombmentsSelect) return;
  const level = Number(entombmentsSelect.value) || 0;
  const optionsHtml = mutationCatalog
    .filter((m) => mutationAllowedForSpecies(m.diet, species))
    .map((m) => `<option value="${String(m.name).replace(/"/g, '&quot;')}">${m.name}</option>`)
    .join('');
  container.innerHTML = mutationSlotTiers.slice(0, level + 1).map((fields, tierIndex) => `
    <div class="mini-heading mutation-tier-heading">${MUTATION_TIER_LABELS[tierIndex] || 'Tier'} mutation slots</div>
    <div class="field-row four-up">
      ${fields.map((field) => `
        <label>
          ${compMutationSlotLabel(field)}
          <select data-comp-mutation-field="${field}">
            <option value="">— none —</option>
            ${optionsHtml}
          </select>
        </label>
      `).join('')}
    </div>
  `).join('');
};

const loadMutationCatalog = async () => {
  try {
    const response = await fetch('/api/mutations-catalog');
    const data = await response.json();
    if (response.ok && Array.isArray(data.mutations)) mutationCatalog = data.mutations;
    if (response.ok && Array.isArray(data.tiers)) mutationSlotTiers = data.tiers;
    if (response.ok && data.speciesDiet && typeof data.speciesDiet === 'object') mutationSpeciesDiet = data.speciesDiet;
  } catch (error) {
    console.debug('Mutation catalog load failed:', error);
  }
  renderMutationSlots();
};

document.querySelector('[data-comp-entombments]')?.addEventListener('change', renderMutationSlots);
document.querySelector('[data-comp-species]')?.addEventListener('change', renderMutationSlots);
loadMutationCatalog();

document.querySelector('[data-compensation-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  const targetSteamId = extractSteamId(document.querySelector('[data-comp-target]')?.value);
  if (!/^\d{17}$/.test(targetSteamId)) {
    showToast('Enter a valid 17-digit Steam ID.');
    return;
  }
  const mutations = {};
  document.querySelectorAll('[data-comp-mutation-field]').forEach((select) => {
    if (select.value) mutations[select.dataset.compMutationField] = select.value;
  });
  const body = {
    granterSteamId: profile.steamId,
    targetSteamId,
    species: document.querySelector('[data-comp-species]')?.value,
    growthPct: Number(document.querySelector('[data-comp-growth]')?.value),
    healthPct: Number(document.querySelector('[data-comp-health]')?.value),
    staminaPct: Number(document.querySelector('[data-comp-stamina]')?.value),
    hungerPct: Number(document.querySelector('[data-comp-hunger]')?.value),
    thirstPct: Number(document.querySelector('[data-comp-thirst]')?.value),
    entombments: Number(document.querySelector('[data-comp-entombments]')?.value) || 0,
    mutations,
    isTransfer: !!document.querySelector('[data-comp-is-transfer]')?.checked,
  };

  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const response = await fetch('/api/compensation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showToast(data.error || 'Could not grant that dino.');
    } else {
      const codeSuffix = data.dino?.compCode ? ` (ref ${data.dino.compCode})` : '';
      showToast(`Granted a ${body.species} to ${targetSteamId}.${codeSuffix}`);
      document.querySelector('[data-comp-target]').value = '';
      const entombmentsSelect = document.querySelector('[data-comp-entombments]');
      if (entombmentsSelect) entombmentsSelect.value = '0';
      renderMutationSlots();
      const transferCheckbox = document.querySelector('[data-comp-is-transfer]');
      if (transferCheckbox) transferCheckbox.checked = false;
      if (body.isTransfer) loadTransferLog();
    }
  } catch (error) {
    console.debug('Compensation grant failed:', error);
    showToast('Could not reach the server right now.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// ── Admin Panel: Recover Dinos ──
//
// Search any player, see their dino history, and revive a dead or
// disconnected lineage as a fresh compensation grant using the exact
// vitals (growth/health/hunger/thirst) captured at that history event —
// reuses the same /api/compensation route the Compensation form above
// calls, just pre-filled from history instead of typed in by hand.
// Mutations/entombments were never tracked per history event (only
// growth+vitals — see main.lua's historyEventToJson), so a recovered
// dino always comes back without them; the section's own note says so.
// Only "dead"/"disconnected" entries get a Recover button — "alive"/
// "parked" lineages are still reachable normally in-game, nothing to
// recover there.
const RECOVERABLE_DINO_STATUSES = new Set(['dead', 'disconnected']);

const buildRecoverHistoryCard = (entry, targetSteamId) => {
  const card = document.createElement('div');
  card.className = 'panel dino-history-card';

  const header = document.createElement('div');
  header.className = 'dino-history-card-header';
  const title = document.createElement('strong');
  title.textContent = entry.species || 'Unknown species';
  const badge = document.createElement('span');
  badge.className = `badge dino-history-status-${entry.status || 'alive'}`;
  badge.textContent = DINO_HISTORY_STATUS_LABELS[entry.status] || entry.status || 'Alive';
  header.append(title, badge);

  const events = entry.events || [];
  const lastEvent = events[events.length - 1] || {};

  const vitals = document.createElement('p');
  vitals.className = 'dino-history-card-vitals';
  vitals.innerHTML = `
    <span>Growth: <strong>${(lastEvent.growthPct || 0).toFixed(1)}%</strong></span>
    <span>Blood (Health): <strong>${(lastEvent.healthPct || 0).toFixed(1)}%</strong></span>
    <span>Water (Thirst): <strong>${(lastEvent.thirstPct || 0).toFixed(1)}%</strong></span>
    <span>Hunger: <strong>${(lastEvent.hungerPct || 0).toFixed(1)}%</strong></span>
  `;

  const timeline = document.createElement('ul');
  timeline.className = 'dino-history-timeline';
  events.forEach((evt) => {
    const item = document.createElement('li');
    const when = evt.at ? new Date(evt.at * 1000).toLocaleString() : '';
    item.textContent = `${DINO_HISTORY_EVENT_LABELS[evt.type] || evt.type} — ${(evt.growthPct || 0).toFixed(1)}% growth — ${when}`;
    timeline.appendChild(item);
  });

  card.append(header, vitals, timeline);

  if (RECOVERABLE_DINO_STATUSES.has(entry.status)) {
    const recoverBtn = document.createElement('button');
    recoverBtn.type = 'button';
    recoverBtn.className = 'action-button small';
    recoverBtn.textContent = 'Recover this dino';
    recoverBtn.addEventListener('click', async () => {
      if (!window.confirm(
        `Grant a fresh ${entry.species} to this player, restored to growth ${(lastEvent.growthPct || 0).toFixed(1)}%, `
        + `health ${(lastEvent.healthPct || 0).toFixed(1)}%? This creates a new compensation grant.`
      )) return;
      recoverBtn.disabled = true;
      try {
        const response = await fetch('/api/compensation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetSteamId,
            species: entry.species,
            growthPct: lastEvent.growthPct || 0,
            healthPct: lastEvent.healthPct || 0,
            staminaPct: lastEvent.staminaPct || 0,
            hungerPct: lastEvent.hungerPct || 0,
            thirstPct: lastEvent.thirstPct || 0,
            entombments: 0,
            mutations: {},
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          showToast(data.error || 'Could not recover that dino.');
          recoverBtn.disabled = false;
          return;
        }
        showToast(`Recovered a ${entry.species} for ${targetSteamId}.`);
        recoverBtn.textContent = 'Recovered ✓';
      } catch (error) {
        console.debug('Dino recover failed:', error);
        showToast('Could not reach the server right now.');
        recoverBtn.disabled = false;
      }
    });
    card.appendChild(recoverBtn);
  }

  return card;
};

const loadRecoverHistory = async () => {
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  const targetSteamId = extractSteamId(document.querySelector('[data-recover-target]')?.value);
  if (!/^\d{17}$/.test(targetSteamId)) {
    showToast('Enter a valid 17-digit Steam ID.');
    return;
  }
  const listEl = document.querySelector('[data-recover-history-list]');
  if (!listEl) return;
  listEl.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const response = await fetch(`/api/dino-history-admin?targetSteamId=${encodeURIComponent(targetSteamId)}`);
    const data = await response.json();
    if (!response.ok) {
      listEl.innerHTML = '';
      showToast(data.error || 'Could not load dino history.');
      return;
    }
    const entries = Array.isArray(data.entries) ? data.entries : [];
    listEl.innerHTML = '';
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No dino history for this player yet.';
      listEl.appendChild(empty);
      return;
    }
    [...entries]
      .sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0))
      .forEach((entry) => listEl.appendChild(buildRecoverHistoryCard(entry, targetSteamId)));
  } catch (error) {
    console.debug('Recover history load failed:', error);
    listEl.innerHTML = '';
    showToast('Could not reach the server right now.');
  }
};

document.querySelector('[data-recover-search]')?.addEventListener('click', loadRecoverHistory);

// ── Admin Panel: Transfer Dinos log ──
//
// Every compensation grant made with "This is a transfer dino" checked
// (see the isTransfer field wired into the Compensation form's submit
// handler above), logged per target player. Purely informational: a
// player past TRANSFER_LIMIT isn't blocked from getting more, their name
// just gets flagged so an admin granting another one knows they're
// already past the informal cap.
const TRANSFER_LIMIT = 25;

const nameForSteamId = (steamId) => playerDirectory.find((p) => p.steamId === steamId)?.name || steamId;

const buildTransferLogCard = (steamId, entries) => {
  const card = document.createElement('div');
  card.className = 'transfer-log-card';

  const header = document.createElement('div');
  header.className = 'transfer-log-card-header';

  const nameEl = document.createElement('strong');
  nameEl.textContent = nameForSteamId(steamId);
  if (entries.length >= TRANSFER_LIMIT) {
    const limitBadge = document.createElement('span');
    limitBadge.className = 'badge transfer-log-limit-badge';
    limitBadge.textContent = 'limit reached for transfers';
    nameEl.append(' ', limitBadge);
  }

  const count = document.createElement('span');
  count.className = 'transfer-log-card-count';
  count.textContent = `${entries.length}/${TRANSFER_LIMIT}`;

  header.append(nameEl, count);

  const list = document.createElement('ul');
  list.className = 'transfer-log-entries';
  [...entries]
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .forEach((entry) => {
      const item = document.createElement('li');
      const when = entry.at ? new Date(entry.at).toLocaleString() : '';
      const label = entry.name ? `${entry.species || 'Unknown'} "${entry.name}"` : (entry.species || 'Unknown');
      item.textContent = `${label} — ${when}`;
      list.appendChild(item);
    });

  card.append(header, list);
  return card;
};

const loadTransferLog = async () => {
  const listEl = document.querySelector('[data-transfer-log-list]');
  if (!listEl) return;
  try {
    const response = await fetch('/api/transfer-log');
    const data = await response.json();
    if (!response.ok) {
      listEl.innerHTML = '';
      return;
    }
    const transfers = data.transfers || {};
    const steamIds = Object.keys(transfers).filter((id) => Array.isArray(transfers[id]) && transfers[id].length > 0);
    listEl.innerHTML = '';
    if (steamIds.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No transfer dinos logged yet.';
      listEl.appendChild(empty);
      return;
    }
    steamIds
      .sort((a, b) => transfers[b].length - transfers[a].length)
      .forEach((steamId) => listEl.appendChild(buildTransferLogCard(steamId, transfers[steamId])));
  } catch (error) {
    console.debug('Transfer log load failed:', error);
  }
};

document.querySelector('[data-currency-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  const targetSteamId = extractSteamId(document.querySelector('[data-currency-target]')?.value);
  if (!/^\d{17}$/.test(targetSteamId)) {
    showToast('Enter a valid 17-digit Steam ID.');
    return;
  }
  const amount = Number(document.querySelector('[data-currency-amount]')?.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('Enter an amount greater than 0.');
    return;
  }
  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const response = await fetch('/api/currency-grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ granterSteamId: profile.steamId, targetSteamId, amount }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showToast(data.error || 'Could not grant that currency.');
    } else {
      showToast(`Granted ${amount.toLocaleString()} LC to ${targetSteamId}. New balance: ${data.balance.toLocaleString()} LC.`);
      document.querySelector('[data-currency-target]').value = '';
      document.querySelector('[data-currency-amount]').value = '';
      if (targetSteamId === profile.steamId) loadCurrencyBalance();
    }
  } catch (error) {
    console.debug('Currency grant failed:', error);
    showToast('Could not reach the server right now.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

document.querySelector('[data-skin-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  const targetSteamId = extractSteamId(document.querySelector('[data-skin-target]')?.value);
  if (!/^\d{17}$/.test(targetSteamId)) {
    showToast('Enter a valid 17-digit Steam ID.');
    return;
  }
  const skinName = document.querySelector('[data-skin-name]')?.value.trim() || '';
  if (!skinName) {
    showToast('Enter a skin name.');
    return;
  }
  const chargeCount = Number(document.querySelector('[data-skin-charge-count]')?.value) || 0;
  if (chargeCount < 1) {
    showToast('Charges must be at least 1.');
    return;
  }

  // The Advanced JSON textarea overrides the color pickers entirely when
  // filled in — the Worker accepts either hex strings or {r,g,b,a} objects
  // per field, mixed freely, so this doesn't need to normalize anything
  // client-side beyond parsing the JSON itself.
  let colors;
  const jsonText = document.querySelector('[data-skin-json]')?.value.trim() || '';
  if (jsonText) {
    try {
      colors = JSON.parse(jsonText);
    } catch (error) {
      showToast('Advanced JSON is not valid JSON.');
      return;
    }
  } else {
    colors = {};
    document.querySelectorAll('[data-skin-color]').forEach((input) => {
      colors[input.dataset.skinColor] = input.value;
    });
  }
  // Plain pattern/variation inputs apply on top regardless of which color
  // source was used, unless left blank — lets someone use the Advanced
  // JSON for colors while still picking a pattern from the dedicated
  // field, without needing to duplicate it into the JSON blob too.
  const patternIndexValue = document.querySelector('[data-skin-pattern-index]')?.value;
  if (patternIndexValue !== '' && patternIndexValue != null) colors.PatternIndex = Number(patternIndexValue);
  const skinVariationValue = document.querySelector('[data-skin-skin-variation]')?.value;
  if (skinVariationValue !== '' && skinVariationValue != null) colors.SkinVariation = Number(skinVariationValue);

  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const response = await fetch('/api/skin-grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        granterSteamId: profile.steamId,
        targetSteamId,
        name: skinName,
        count: chargeCount,
        colors,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showToast(data.error || 'Could not grant that skin.');
    } else {
      showToast(`Granted ${chargeCount} charge(s) of "${skinName}" to ${targetSteamId}.`);
      document.querySelector('[data-skin-target]').value = '';
      document.querySelector('[data-skin-name]').value = '';
    }
  } catch (error) {
    console.debug('Skin grant failed:', error);
    showToast('Could not reach the server right now.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// ── Skin Library (owner-tier save area + grant-form dropdown) ──
//
// Saving/deleting is owner-tier only (enforced server-side regardless of
// what this UI shows — checkAdminPanelAccess only reveals the [data-owner-
// only] section for tier === 'owner'), but the resulting dropdown on the
// Glitch Skins grant form above is populated for every admin tier, since
// granting itself was never owner-restricted.
let skinLibraryCache = [];

// Non-null when a saved skin is currently loaded into the Skin Library
// form for editing (via the "Edit an existing skin" dropdown) — toggles
// which of the two save buttons is visible and whether saving clears the
// form afterward. Null means "starting a brand new skin."
let editingSkinName = null;

const setSkinLibraryEditingState = (name) => {
  editingSkinName = name || null;
  const saveBtn = document.querySelector('[data-skin-library-form] button[type="submit"]');
  const saveChangesBtn = document.querySelector('[data-skin-library-save-changes]');
  if (saveBtn) saveBtn.hidden = !!editingSkinName;
  if (saveChangesBtn) saveChangesBtn.hidden = !editingSkinName;
};

const populateSkinLibrarySelect = (skins) => {
  const select = document.querySelector('[data-skin-library-select]');
  if (!select) return;
  select.innerHTML = '<option value="">Pick a saved skin…</option>';
  skins.forEach((skin) => {
    const option = document.createElement('option');
    option.value = skin.name;
    option.textContent = skin.name;
    select.appendChild(option);
  });
};

const populateSkinLibraryEditSelect = (skins) => {
  const select = document.querySelector('[data-skin-library-edit-select]');
  if (!select) return;
  const previousValue = select.value;
  select.innerHTML = '<option value="">Start a new skin…</option>';
  skins.forEach((skin) => {
    const option = document.createElement('option');
    option.value = skin.name;
    option.textContent = skin.name;
    select.appendChild(option);
  });
  if ([...select.options].some((opt) => opt.value === previousValue)) select.value = previousValue;
};

const renderSkinLibraryList = (skins) => {
  const list = document.querySelector('[data-skin-library-list]');
  if (!list) return;
  list.innerHTML = '';
  if (!skins.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No saved skins yet.';
    list.appendChild(empty);
    return;
  }
  skins.forEach((skin) => {
    const card = document.createElement('div');
    card.className = 'panel dino-history-card';

    const header = document.createElement('div');
    header.className = 'dino-history-card-header';
    const title = document.createElement('strong');
    title.textContent = skin.name;
    const swatch = document.createElement('span');
    swatch.className = 'badge';
    const bodyColor = skin.colors?.BodyColor;
    if (bodyColor) {
      const r = Math.round((bodyColor.r ?? 0.5) * 255);
      const g = Math.round((bodyColor.g ?? 0.5) * 255);
      const b = Math.round((bodyColor.b ?? 0.5) * 255);
      swatch.style.background = `rgb(${r}, ${g}, ${b})`;
      swatch.textContent = ' ';
    } else {
      swatch.textContent = 'No preview';
    }
    header.append(title, swatch);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'secondary-button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      const profile = getSteamProfile();
      if (!profile?.steamId) return;
      deleteBtn.disabled = true;
      try {
        const response = await fetch('/api/skin-library-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ granterSteamId: profile.steamId, name: skin.name }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          showToast(data.error || 'Could not delete that skin.');
          deleteBtn.disabled = false;
        } else {
          showToast(`Deleted "${skin.name}" from the library.`);
          loadSkinLibrary();
        }
      } catch (error) {
        console.debug('Skin library delete failed:', error);
        showToast('Could not reach the server right now.');
        deleteBtn.disabled = false;
      }
    });

    card.append(header, deleteBtn);
    list.appendChild(card);
  });
};

const loadSkinLibrary = async () => {
  const profile = getSteamProfile();
  if (!profile?.steamId) return;
  try {
    const response = await fetch(`/api/skin-library?requesterSteamId=${encodeURIComponent(profile.steamId)}`);
    const data = await response.json();
    if (response.ok && Array.isArray(data.skins)) {
      skinLibraryCache = data.skins;
      populateSkinLibrarySelect(skinLibraryCache);
      populateSkinLibraryEditSelect(skinLibraryCache);
      renderSkinLibraryList(skinLibraryCache);
    }
  } catch (error) {
    console.debug('Skin library load failed:', error);
  }
};

// Picking a saved skin from the grant form's dropdown auto-fills the name
// and the Advanced JSON field with the FULL saved colors object — always,
// not just when the skin has non-picker fields like Teeth/Mouth/Claws.
// Previously this only populated JSON for skins with those "extra"
// fields and otherwise split the data across the color pickers plus the
// separate Pattern Index/Skin Variation number inputs instead, which
// meant a skin someone originally entered via the JSON box came back
// empty when reselected. JSON is the single source of truth once
// populated this way (collectSkinLibraryColors always prefers it when
// non-empty), so the pickers and the two number inputs are cleared
// alongside it rather than left showing stale, now-redundant values.
document.querySelector('[data-skin-library-select]')?.addEventListener('change', (event) => {
  const skin = skinLibraryCache.find((s) => s.name === event.target.value);
  if (!skin) return;
  const nameInput = document.querySelector('[data-skin-name]');
  if (nameInput) nameInput.value = skin.name;

  const jsonField = document.querySelector('[data-skin-json]');
  if (jsonField) jsonField.value = JSON.stringify(skin.colors, null, 2);
  document.querySelectorAll('[data-skin-color]').forEach((input) => { input.value = '#808080'; });
  // Shows the skin's actual current value, not blank — leaving these
  // blank made it look like there was no pattern set at all (it was just
  // sitting inside the JSON, invisible), and easy to miss when trying to
  // change it. Still always an explicit, correct value for THIS skin
  // specifically (never a leftover from whatever was last selected),
  // which is the part that actually mattered for the original bug.
  const patternInput = document.querySelector('[data-skin-pattern-index]');
  if (patternInput) patternInput.value = skin.colors?.PatternIndex ?? '';
  const variationInput = document.querySelector('[data-skin-skin-variation]');
  if (variationInput) variationInput.value = skin.colors?.SkinVariation ?? '';
});

// The Skin Library form's OWN "load for editing" dropdown — separate from
// the grant form's dropdown above, since this one loads into the Skin
// Library's own fields and flips into "editing" mode (see
// setSkinLibraryEditingState), swapping which save button shows.
document.querySelector('[data-skin-library-edit-select]')?.addEventListener('change', (event) => {
  const skinName = event.target.value;
  const nameInput = document.querySelector('[data-skin-library-name]');
  const jsonField = document.querySelector('[data-skin-library-json]');
  const patternInput = document.querySelector('[data-skin-library-pattern-index]');
  const variationInput = document.querySelector('[data-skin-library-skin-variation]');

  if (!skinName) {
    if (nameInput) nameInput.value = '';
    if (jsonField) jsonField.value = '';
    if (patternInput) patternInput.value = '';
    if (variationInput) variationInput.value = '';
    document.querySelectorAll('[data-skin-library-color]').forEach((input) => { input.value = '#808080'; });
    setSkinLibraryEditingState(null);
    return;
  }

  const skin = skinLibraryCache.find((s) => s.name === skinName);
  if (!skin) return;
  if (nameInput) nameInput.value = skin.name;

  // Always the full saved colors object, not just when it has non-picker
  // fields — see the grant-form dropdown's handler above for why (a skin
  // originally entered via this JSON box came back empty on reselect
  // otherwise). JSON is the single source of truth once populated this
  // way, so the pickers and the two number inputs are cleared alongside
  // it rather than left showing stale, now-redundant values.
  if (jsonField) jsonField.value = JSON.stringify(skin.colors, null, 2);
  document.querySelectorAll('[data-skin-library-color]').forEach((input) => { input.value = '#808080'; });
  // Shows the skin's actual current value, not blank — see the identical
  // comment on the grant-form dropdown's handler above for why.
  if (patternInput) patternInput.value = skin.colors?.PatternIndex ?? '';
  if (variationInput) variationInput.value = skin.colors?.SkinVariation ?? '';

  setSkinLibraryEditingState(skin.name);
});

// Shared by the Save-to-library submit and the Test-on-my-live-dino
// button — both need "whatever colors are currently in the form," either
// from the pickers or the Advanced JSON override. Returns null (after
// showing a toast) on invalid JSON, matching the pre-refactor inline
// behavior each caller had.
const collectSkinLibraryColors = () => {
  let colors;
  const jsonText = document.querySelector('[data-skin-library-json]')?.value.trim() || '';
  if (jsonText) {
    try {
      colors = JSON.parse(jsonText);
    } catch (error) {
      showToast('Advanced JSON is not valid JSON.');
      return null;
    }
  } else {
    colors = {};
    document.querySelectorAll('[data-skin-library-color]').forEach((input) => {
      colors[input.dataset.skinLibraryColor] = input.value;
    });
  }
  // Plain pattern/variation inputs apply on top regardless of color
  // source, unless left blank — same reasoning as the grant form.
  const patternIndexValue = document.querySelector('[data-skin-library-pattern-index]')?.value;
  if (patternIndexValue !== '' && patternIndexValue != null) colors.PatternIndex = Number(patternIndexValue);
  const skinVariationValue = document.querySelector('[data-skin-library-skin-variation]')?.value;
  if (skinVariationValue !== '' && skinVariationValue != null) colors.SkinVariation = Number(skinVariationValue);
  return colors;
};

document.querySelector('[data-skin-library-test]')?.addEventListener('click', (event) => {
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  const colors = collectSkinLibraryColors();
  if (colors === null) return;
  requestActionAndPoll({
    endpoint: '/api/skin-test',
    body: { steamId: profile.steamId, colors },
    buttonEl: event.target,
    idleLabel: 'Test on my live dino',
    waitingLabel: 'Waiting for in-game…',
  });
});

// Shared by the "Save to library" submit and the "Save changes" button —
// both hit the same upsert-by-name endpoint, the only difference is
// whether an existing skin was loaded for editing (see the edit-select
// dropdown's change handler below), which controls whether the form
// clears afterward (starting fresh) or stays as-is (still editing).
const saveSkinToLibrary = async (buttonEl) => {
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  const name = document.querySelector('[data-skin-library-name]')?.value.trim() || '';
  if (!name) {
    showToast('Enter a skin name.');
    return;
  }

  const colors = collectSkinLibraryColors();
  if (colors === null) return;

  if (buttonEl) buttonEl.disabled = true;
  try {
    const response = await fetch('/api/skin-library-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ granterSteamId: profile.steamId, name, colors }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showToast(data.error || 'Could not save that skin.');
    } else {
      showToast(editingSkinName ? `Saved changes to "${name}".` : `Saved "${name}" to the library.`);
      if (!editingSkinName) {
        // Every field, not just name/json — leaving the color pickers or
        // the Pattern Index/Skin Variation number inputs populated meant
        // they silently carried over into the NEXT new skin saved, with
        // no visual cue anything was stale. Confirmed live: every saved
        // skin that had a pattern ended up with the exact same
        // PatternIndex, because whoever set it once never touched that
        // field again for later skins.
        document.querySelector('[data-skin-library-name]').value = '';
        document.querySelector('[data-skin-library-json]').value = '';
        document.querySelectorAll('[data-skin-library-color]').forEach((input) => { input.value = '#808080'; });
        const patternInput = document.querySelector('[data-skin-library-pattern-index]');
        if (patternInput) patternInput.value = '';
        const variationInput = document.querySelector('[data-skin-library-skin-variation]');
        if (variationInput) variationInput.value = '';
      }
      loadSkinLibrary();
    }
  } catch (error) {
    console.debug('Skin library save failed:', error);
    showToast('Could not reach the server right now.');
  } finally {
    if (buttonEl) buttonEl.disabled = false;
  }
};

document.querySelector('[data-skin-library-form]')?.addEventListener('submit', (event) => {
  event.preventDefault();
  saveSkinToLibrary(event.target.querySelector('button[type="submit"]'));
});

document.querySelector('[data-skin-library-save-changes]')?.addEventListener('click', (event) => {
  saveSkinToLibrary(event.target);
});

const renderStrikeList = (strikes) => {
  const listEl = document.querySelector('[data-strike-list]');
  const emptyEl = document.querySelector('[data-strike-empty]');
  if (!listEl) return;
  if (!strikes || strikes.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.hidden = false;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;
  listEl.innerHTML = strikes.map((strike) => {
    const date = new Date(strike.issuedAt).toLocaleString();
    const reason = String(strike.reason || '').replace(/</g, '&lt;');
    const evidence = String(strike.evidence || '').replace(/</g, '&lt;');
    return `
      <div class="strike-entry">
        <div class="strike-entry-meta">
          <span>By ${strike.issuerSteamId} (${strike.issuerTier})</span>
          <span>${date}</span>
        </div>
        <p class="strike-entry-reason">${reason}</p>
        ${evidence ? `<p class="strike-entry-evidence">${evidence}</p>` : ''}
      </div>
    `;
  }).join('');
};

const loadStrikeHistory = async () => {
  const profile = getSteamProfile();
  const targetSteamId = extractSteamId(document.querySelector('[data-strike-target]')?.value);
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  if (!/^\d{17}$/.test(targetSteamId)) {
    showToast('Enter a valid 17-digit Steam ID.');
    return;
  }
  try {
    const response = await fetch(
      `/api/strikes?targetSteamId=${encodeURIComponent(targetSteamId)}&requesterSteamId=${encodeURIComponent(profile.steamId)}`,
    );
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showToast(data.error || 'Could not load strike history.');
      return;
    }
    renderStrikeList(data.strikes);
  } catch (error) {
    console.debug('Strike history load failed:', error);
    showToast('Could not reach the server right now.');
  }
};

document.querySelector('[data-strike-load]')?.addEventListener('click', loadStrikeHistory);

document.querySelector('[data-strike-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  const targetSteamId = extractSteamId(document.querySelector('[data-strike-target]')?.value);
  if (!/^\d{17}$/.test(targetSteamId)) {
    showToast('Enter a valid 17-digit Steam ID.');
    return;
  }
  const reason = document.querySelector('[data-strike-reason]')?.value.trim() || '';
  if (!reason) {
    showToast('A reason is required.');
    return;
  }
  const evidence = document.querySelector('[data-strike-evidence]')?.value.trim() || '';

  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const response = await fetch('/api/strikes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issuerSteamId: profile.steamId, targetSteamId, reason, evidence }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showToast(data.error || 'Could not issue that strike.');
    } else {
      showToast(`Strike issued against ${targetSteamId}.`);
      document.querySelector('[data-strike-reason]').value = '';
      document.querySelector('[data-strike-evidence]').value = '';
      loadStrikeHistory();
    }
  } catch (error) {
    console.debug('Strike issue failed:', error);
    showToast('Could not reach the server right now.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// ── Community tab: public staff roster ──
//
// Unauthenticated, unlike the Admin Panel tab above — this is a public
// "meet the team" listing (/api/staff-roster -> the bridge Worker's
// /admin-roster-public -> the same KV-synced admin_tiers.json). Tiers with
// no members (Senior Admin right now) stay hidden entirely rather than
// showing an empty section.
const STAFF_TIER_LABELS = { owner: 'Owner', senior: 'Senior Admin', admin: 'Admin' };

// Every current staffer gets a card here regardless of whether they've
// written a bio yet (falls back to an italic placeholder) — this is a
// "meet the whole team" listing, not just the ones who filled out the
// form, since the roster grid right above it already shows everyone too.
const renderStaffBios = (data) => {
  const wrap = document.querySelector('[data-staff-bios]');
  const grid = document.querySelector('[data-staff-bio-grid]');
  if (!wrap || !grid) return;
  const members = ['owner', 'senior', 'admin'].flatMap((tier) => (data[tier] || []).map((member) => ({ ...member, tier })));
  if (members.length === 0) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  grid.innerHTML = members.map((member) => {
    const bio = String(member.bio || '').trim();
    const bioHtml = bio
      ? String(bio).replace(/</g, '&lt;')
      : "This staff member hasn't shared a bio yet.";
    return `
      <div class="staff-bio-card">
        <div class="staff-bio-card-header">
          ${member.avatar ? `<img src="${member.avatar}" alt="" />` : ''}
          <div>
            <strong>${String(member.name).replace(/</g, '&lt;')}</strong>
            <span class="staff-bio-card-tier">${STAFF_TIER_LABELS[member.tier] || member.tier}</span>
          </div>
        </div>
        <p class="staff-bio-card-text${bio ? '' : ' is-empty'}">${bioHtml}</p>
      </div>
    `;
  }).join('');
};

let lastStaffRosterData = null;

const loadStaffRoster = async () => {
  const rosterEl = document.querySelector('[data-staff-roster]');
  if (!rosterEl) return;
  try {
    const response = await fetch('/api/staff-roster');
    const data = await response.json();
    lastStaffRosterData = data;
    let anyVisible = false;
    ['owner', 'senior', 'admin'].forEach((tier) => {
      const members = data[tier] || [];
      const groupEl = document.querySelector(`[data-staff-group="${tier}"]`);
      const listEl = document.querySelector(`[data-staff-list="${tier}"]`);
      if (!groupEl || !listEl) return;
      if (members.length === 0) {
        groupEl.hidden = true;
        return;
      }
      groupEl.hidden = false;
      anyVisible = true;
      listEl.innerHTML = members.map((member) => `
        <div class="staff-member">
          ${member.avatar ? `<img src="${member.avatar}" alt="" />` : ''}
          <span class="staff-member-name">${String(member.name).replace(/</g, '&lt;')}</span>
        </div>
      `).join('');
    });
    rosterEl.hidden = !anyVisible;
    renderStaffBios(data);
  } catch (error) {
    console.debug('Staff roster load failed:', error);
  }
};

document.querySelector('[data-tab="community"]')?.addEventListener('click', loadStaffRoster);
loadStaffRoster();

// ── Admin Panel: self-service "Meet the Staff" bio editor ──
//
// Pre-filled from the same public /api/staff-roster payload the
// Community tab uses (reusing lastStaffRosterData if a load already
// happened this page view, otherwise fetching fresh) — no separate
// "get my own bio" endpoint needed since the public roster already
// carries every staffer's bio, and finding this viewer's own steamId in
// it is just as accurate.
const loadOwnStaffBio = async () => {
  const input = document.querySelector('[data-staff-bio-input]');
  const profile = getSteamProfile();
  if (!input || !profile?.steamId) return;
  try {
    const data = lastStaffRosterData || await (await fetch('/api/staff-roster')).json();
    lastStaffRosterData = data;
    const mine = ['owner', 'senior', 'admin']
      .flatMap((tier) => data[tier] || [])
      .find((member) => member.steamId === profile.steamId);
    input.value = mine?.bio || '';
  } catch (error) {
    console.debug('Own staff bio load failed:', error);
  }
};

document.querySelector('[data-staff-bio-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('[data-staff-bio-input]');
  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const response = await fetch('/api/staff-bio-set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: input?.value || '' }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showToast(data.error || 'Could not save your bio.');
    } else {
      showToast('Bio saved.');
      lastStaffRosterData = null;
      loadStaffRoster();
    }
  } catch (error) {
    console.debug('Staff bio save failed:', error);
    showToast('Could not reach the server right now.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// ── Friends tab: friend requests, friend list, and meet-up teleports ──
//
// Pure KV on the Worker side (no game-server file writes) for the social
// graph itself; teleport-accept is the one action that reaches out to the
// mod, via the same request-file bridge pattern as park/redeem/skin-use,
// but with no result polling here (see bridge-worker.js's
// requestTeleportExecute comment for why) — both friends get an in-game
// notification from main.lua once the actual move happens.
const setFriendsSignedInVisibility = (signedIn) => {
  document.querySelectorAll('[data-friends-signed-in-only]').forEach((el) => { el.hidden = !signedIn; });
  const signedOutEl = document.querySelector('[data-friends-signed-out]');
  if (signedOutEl) signedOutEl.hidden = signedIn;
};

const buildFriendRequestCard = (req) => {
  const card = document.createElement('article');
  card.className = 'parked-card request-card';

  const name = document.createElement('h3');
  name.className = 'request-card-name';
  name.textContent = req.fromName || req.fromSteamId;

  const meta = document.createElement('p');
  meta.className = 'request-card-meta';
  meta.textContent = 'Wants to be friends';

  const actions = document.createElement('div');
  actions.className = 'request-card-actions';

  const acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.className = 'action-button small';
  acceptBtn.textContent = 'Accept';
  acceptBtn.addEventListener('click', async () => {
    const steamId = getSteamProfile()?.steamId;
    if (!steamId) return;
    acceptBtn.disabled = true;
    try {
      const response = await fetch('/api/friend-accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId, requesterSteamId: req.fromSteamId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        showToast(data.error || 'Could not accept that request.');
        acceptBtn.disabled = false;
        return;
      }
      showToast('Friend added!');
      loadFriendsTabData();
    } catch (error) {
      console.debug('Friend accept failed:', error);
      showToast('Could not reach the server right now.');
      acceptBtn.disabled = false;
    }
  });

  const declineBtn = document.createElement('button');
  declineBtn.type = 'button';
  declineBtn.className = 'action-button small parked-release-button';
  declineBtn.textContent = 'Decline';
  declineBtn.addEventListener('click', async () => {
    const steamId = getSteamProfile()?.steamId;
    if (!steamId) return;
    declineBtn.disabled = true;
    try {
      const response = await fetch('/api/friend-decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId, requesterSteamId: req.fromSteamId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        showToast(data.error || 'Could not decline that request.');
        declineBtn.disabled = false;
        return;
      }
      loadFriendsTabData();
    } catch (error) {
      console.debug('Friend decline failed:', error);
      showToast('Could not reach the server right now.');
      declineBtn.disabled = false;
    }
  });

  actions.append(acceptBtn, declineBtn);
  card.append(name, meta, actions);
  return card;
};

// Favoriting is a per-viewer display preference (which of your own
// friends you want pinned to the top of Online/Offline), not gameplay
// state — same reasoning as the Home hub's drag-reorder, which is also
// localStorage-only. Keyed by the viewer's own steamId since a shared
// browser could have more than one account sign in over time.
const FAVORITE_FRIENDS_STORAGE_KEY_PREFIX = 'levelsFavoriteFriends:';

const getFavoriteFriendIds = () => {
  const steamId = getSteamProfile()?.steamId;
  if (!steamId) return new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITE_FRIENDS_STORAGE_KEY_PREFIX + steamId) || '[]');
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
};

const toggleFavoriteFriend = (friendSteamId) => {
  const steamId = getSteamProfile()?.steamId;
  if (!steamId) return;
  const ids = getFavoriteFriendIds();
  if (ids.has(friendSteamId)) {
    ids.delete(friendSteamId);
  } else {
    ids.add(friendSteamId);
  }
  try {
    localStorage.setItem(FAVORITE_FRIENDS_STORAGE_KEY_PREFIX + steamId, JSON.stringify([...ids]));
  } catch (error) {
    console.debug('Saving favorite friends failed:', error);
  }
};

// Set by loadFriendsTabData so a favorite click can re-render immediately
// without a fresh network round trip — the friend objects already carry
// their websiteOnline/inGame fields from fetchFriendStatusData by then.
let lastLoadedFriends = [];

const buildFriendCard = (friend) => {
  const card = document.createElement('article');
  card.className = 'parked-card friend-card';
  card.dataset.friendCard = friend.steamId;

  const isFavorite = getFavoriteFriendIds().has(friend.steamId);
  const favoriteBtn = document.createElement('button');
  favoriteBtn.type = 'button';
  favoriteBtn.className = 'friend-card-favorite';
  favoriteBtn.classList.toggle('is-favorite', isFavorite);
  favoriteBtn.textContent = isFavorite ? '★' : '☆';
  favoriteBtn.setAttribute('aria-label', isFavorite ? 'Unfavorite this friend' : 'Favorite this friend');
  favoriteBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFavoriteFriend(friend.steamId);
    renderFriendsGrouped(lastLoadedFriends);
  });

  const name = document.createElement('h3');
  name.className = 'friend-card-name';
  name.textContent = friend.name || friend.steamId;

  const meta = document.createElement('p');
  meta.className = 'friend-card-meta';
  meta.textContent = friend.since ? `Friends since ${new Date(friend.since).toLocaleDateString()}` : 'Friends';

  const status = document.createElement('p');
  status.className = 'friend-card-status';
  status.textContent = 'Checking status…';

  const actions = document.createElement('div');
  actions.className = 'friend-card-actions';

  const sendTeleportRequest = async (direction, button) => {
    const steamId = getSteamProfile()?.steamId;
    if (!steamId) return;
    button.disabled = true;
    try {
      const response = await fetch('/api/teleport-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromSteamId: steamId, toSteamId: friend.steamId, direction }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        showToast(data.error || 'Could not send that teleport request.');
      } else {
        showToast('Teleport request sent — waiting for them to accept.');
      }
    } catch (error) {
      console.debug('Teleport request failed:', error);
      showToast('Could not reach the server right now.');
    } finally {
      button.disabled = false;
    }
  };

  const toThemBtn = document.createElement('button');
  toThemBtn.type = 'button';
  toThemBtn.className = 'action-button small';
  toThemBtn.textContent = 'Teleport to them';
  toThemBtn.addEventListener('click', () => sendTeleportRequest('requester_to_friend', toThemBtn));

  const bringBtn = document.createElement('button');
  bringBtn.type = 'button';
  bringBtn.className = 'action-button small';
  bringBtn.textContent = 'Bring them to me';
  bringBtn.addEventListener('click', () => sendTeleportRequest('friend_to_requester', bringBtn));

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'action-button small parked-release-button';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', async () => {
    const steamId = getSteamProfile()?.steamId;
    if (!steamId) return;
    if (!window.confirm(`Remove ${friend.name || friend.steamId} from your friends?`)) return;
    removeBtn.disabled = true;
    try {
      const response = await fetch('/api/friend-remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId, friendSteamId: friend.steamId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        showToast(data.error || 'Could not remove that friend.');
        removeBtn.disabled = false;
        return;
      }
      loadFriendsTabData();
    } catch (error) {
      console.debug('Friend remove failed:', error);
      showToast('Could not reach the server right now.');
      removeBtn.disabled = false;
    }
  });

  // Gift a parked dino: same select+button shape as the skin-attach row on
  // the Inventory tab, sourced from the same parkedEntries the Inventory
  // tab already loads — filtered to the viewer's own dinos so nobody can
  // gift a dino they don't own.
  const giftRow = document.createElement('div');
  giftRow.className = 'skin-attach-row';
  const giftSelect = document.createElement('select');
  const rebuildGiftOptions = () => {
    const viewerSteamId = getSteamProfile()?.steamId;
    const ownDinos = parkedEntries.filter((entry) => entry.steam === viewerSteamId);
    giftSelect.innerHTML = '';
    if (ownDinos.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'No parked dinos to gift';
      option.disabled = true;
      giftSelect.appendChild(option);
      giftBtn.disabled = true;
    } else {
      ownDinos.forEach((entry) => {
        const option = document.createElement('option');
        option.value = String(entry.capturedAt);
        option.textContent = entry.name ? `${entry.name} (${entry.species})` : entry.species;
        giftSelect.appendChild(option);
      });
      giftBtn.disabled = false;
    }
  };

  const giftBtn = document.createElement('button');
  giftBtn.type = 'button';
  giftBtn.className = 'action-button small';
  giftBtn.textContent = 'Gift';
  giftBtn.addEventListener('click', async () => {
    const steamId = getSteamProfile()?.steamId;
    if (!steamId) {
      showToast('Sign in with Steam first.');
      return;
    }
    const capturedAt = Number(giftSelect.value);
    if (!capturedAt) return;
    if (!window.confirm(`Gift this dino to ${friend.name || friend.steamId}? This can't be undone.`)) return;
    giftBtn.disabled = true;
    try {
      const response = await fetch('/api/gift-dino', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromSteamId: steamId, toSteamId: friend.steamId, capturedAt }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        showToast(data.error || 'Could not gift that dino.');
        giftBtn.disabled = false;
        return;
      }
      showToast(`Gifted to ${friend.name || friend.steamId}.`);
      await loadParkedList();
      rebuildGiftOptions();
    } catch (error) {
      console.debug('Gift dino failed:', error);
      showToast('Could not reach the server right now.');
      giftBtn.disabled = false;
    }
  });
  rebuildGiftOptions();
  giftRow.append(giftSelect, giftBtn);

  actions.append(toThemBtn, bringBtn, giftRow, removeBtn);
  card.append(favoriteBtn, name, meta, status, actions);
  return card;
};

// Fills in a friend card's "Checking status…" placeholder once presence +
// in-game data comes back — separate from buildFriendCard itself since
// that data arrives slightly later (a batched presence read plus one
// growth-status read per friend) than the friend list itself.
const updateFriendCardStatus = (card, friend) => {
  const status = card.querySelector('.friend-card-status');
  if (!status) return;
  const parts = [friend.websiteOnline ? '🌐 Online' : '🌐 Offline'];
  if (friend.inGame) {
    parts.push(friend.playingAs ? `🎮 Playing as ${friend.playingAs}` : '🎮 In-game');
  } else {
    parts.push('🎮 Not in-game');
  }
  status.textContent = parts.join(' · ');
};

// Presence is one batched read; in-game status needs one live Pterodactyl
// file read per friend (functions/api/growth-status.js), same as the Live
// Dino tab already does for the signed-in player's own status — friend
// lists are small in practice, so N parallel reads here is fine without
// building new batching infrastructure.
const ONLINE_GAME_WINDOW_MS = 15000; // 3s poll tick + a generous buffer for the read round trip

// Pure data fetch — mutates each friend object's websiteOnline/inGame/
// playingAs in place but touches no DOM, since loadFriendsTabData now
// waits on this BEFORE building any cards (needed to sort into the
// Online/Offline sections up front, rather than building one flat list
// and re-sorting it after the fact).
const fetchFriendStatusData = async (friends) => {
  if (!friends.length) return;
  const steamIds = friends.map((f) => f.steamId);
  try {
    const [presenceResponse, ...growthResponses] = await Promise.all([
      fetch(`/api/presence?steamIds=${encodeURIComponent(steamIds.join(','))}`),
      ...steamIds.map((id) => fetch(`/api/growth-status?steamId=${encodeURIComponent(id)}`)),
    ]);
    const presenceData = await presenceResponse.json();
    const growthDataList = await Promise.all(growthResponses.map((r) => r.json()));

    friends.forEach((friend, i) => {
      friend.websiteOnline = !!presenceData.presence?.[friend.steamId]?.online;
      const growth = growthDataList[i];
      const fresh = !!(growth?.updatedAt && (Date.now() - growth.updatedAt) < ONLINE_GAME_WINDOW_MS);
      friend.inGame = fresh;
      friend.playingAs = fresh && growth.hasLivePawn ? growth.species : null;
    });
  } catch (error) {
    console.debug('Friend status load failed:', error);
  }
};

// Online (website or in-game, either counts) and Offline each get their own
// dropdown section with a live "(N)" count in the toggle label — both start
// collapsible; only the expand/collapse state of the grids themselves is
// left untouched by a re-render (whatever the player last chose stays put
// across friend-list refreshes), so accepting/removing/gifting doesn't
// snap either section back to its default state mid-session.
//
// Favorited friends sort to the top of whichever section (Online or
// Offline) they're already in — a favorite never moves a friend between
// sections, it just reorders within one. Array.prototype.sort is stable,
// so friends tied on favorite status keep whatever order they arrived in.
const renderFriendsGrouped = (friends) => {
  const onlineGrid = document.querySelector('[data-friends-online-grid]');
  const offlineGrid = document.querySelector('[data-friends-offline-grid]');
  const onlineCount = document.querySelector('[data-friends-online-count]');
  const offlineCount = document.querySelector('[data-friends-offline-count]');
  if (!onlineGrid || !offlineGrid) return;

  onlineGrid.innerHTML = '';
  offlineGrid.innerHTML = '';

  const favorites = getFavoriteFriendIds();
  const sorted = [...friends].sort((a, b) => (favorites.has(b.steamId) ? 1 : 0) - (favorites.has(a.steamId) ? 1 : 0));

  let onlineTotal = 0;
  let offlineTotal = 0;
  sorted.forEach((friend) => {
    const card = buildFriendCard(friend);
    updateFriendCardStatus(card, friend);
    if (friend.websiteOnline || friend.inGame) {
      onlineGrid.appendChild(card);
      onlineTotal += 1;
    } else {
      offlineGrid.appendChild(card);
      offlineTotal += 1;
    }
  });

  if (onlineCount) onlineCount.textContent = onlineTotal;
  if (offlineCount) offlineCount.textContent = offlineTotal;
};

const bindFriendsGroupToggle = (toggleSelector, gridSelector) => {
  document.querySelector(toggleSelector)?.addEventListener('click', (event) => {
    const grid = document.querySelector(gridSelector);
    if (!grid) return;
    grid.hidden = !grid.hidden;
    event.currentTarget.classList.toggle('is-expanded', !grid.hidden);
  });
};
bindFriendsGroupToggle('[data-friends-online-toggle]', '[data-friends-online-grid]');
bindFriendsGroupToggle('[data-friends-offline-toggle]', '[data-friends-offline-grid]');

const buildTeleportRequestCard = (req) => {
  const card = document.createElement('article');
  card.className = 'parked-card request-card';

  const name = document.createElement('h3');
  name.className = 'request-card-name';
  name.textContent = req.fromName || req.fromSteamId;

  const meta = document.createElement('p');
  meta.className = 'request-card-meta';
  meta.textContent = req.direction === 'requester_to_friend'
    ? 'Wants to teleport to you'
    : 'Wants you to teleport to them';

  const actions = document.createElement('div');
  actions.className = 'request-card-actions';

  const acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.className = 'action-button small';
  acceptBtn.textContent = 'Accept';
  acceptBtn.addEventListener('click', async () => {
    const steamId = getSteamProfile()?.steamId;
    if (!steamId) return;
    acceptBtn.disabled = true;
    try {
      const response = await fetch('/api/teleport-accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId, requesterSteamId: req.fromSteamId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        showToast(data.error || 'Could not accept that teleport request.');
        acceptBtn.disabled = false;
        return;
      }
      showToast('Accepted — check in-game in a few seconds.');
      loadFriendsTabData();
    } catch (error) {
      console.debug('Teleport accept failed:', error);
      showToast('Could not reach the server right now.');
      acceptBtn.disabled = false;
    }
  });

  const declineBtn = document.createElement('button');
  declineBtn.type = 'button';
  declineBtn.className = 'action-button small parked-release-button';
  declineBtn.textContent = 'Decline';
  declineBtn.addEventListener('click', async () => {
    const steamId = getSteamProfile()?.steamId;
    if (!steamId) return;
    declineBtn.disabled = true;
    try {
      const response = await fetch('/api/teleport-decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId, requesterSteamId: req.fromSteamId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        showToast(data.error || 'Could not decline that request.');
        declineBtn.disabled = false;
        return;
      }
      loadFriendsTabData();
    } catch (error) {
      console.debug('Teleport decline failed:', error);
      showToast('Could not reach the server right now.');
      declineBtn.disabled = false;
    }
  });

  actions.append(acceptBtn, declineBtn);
  card.append(name, meta, actions);
  return card;
};

const loadFriendsTabData = async () => {
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    setFriendsSignedInVisibility(false);
    return;
  }
  setFriendsSignedInVisibility(true);
  const steamId = profile.steamId;

  try {
    const [friendsRes, friendReqRes, teleportReqRes] = await Promise.all([
      fetch(`/api/friends?steamId=${encodeURIComponent(steamId)}`),
      fetch(`/api/friend-requests?steamId=${encodeURIComponent(steamId)}`),
      fetch(`/api/teleport-requests?steamId=${encodeURIComponent(steamId)}`),
    ]);
    const [friendsData, friendReqData, teleportReqData] = await Promise.all([
      friendsRes.json(),
      friendReqRes.json(),
      teleportReqRes.json(),
    ]);

    const friendsEmpty = document.querySelector('[data-friends-empty]');
    const friends = friendsData.friends || [];
    if (friendsEmpty) friendsEmpty.hidden = friends.length !== 0;
    // Status is fetched before rendering (not after, as a fill-in-later
    // pass) so friends can be sorted into Online/Offline sections up
    // front, rather than building one flat list and re-sorting it once
    // status arrives a moment later.
    await fetchFriendStatusData(friends);
    lastLoadedFriends = friends;
    renderFriendsGrouped(friends);

    const friendReqGrid = document.querySelector('[data-friend-requests-grid]');
    const friendReqEmpty = document.querySelector('[data-friend-requests-empty]');
    const friendRequests = friendReqData.requests || [];
    if (friendReqEmpty) friendReqEmpty.hidden = friendRequests.length !== 0;
    if (friendReqGrid) {
      friendReqGrid.innerHTML = '';
      friendRequests.forEach((req) => friendReqGrid.appendChild(buildFriendRequestCard(req)));
    }

    const teleportReqGrid = document.querySelector('[data-teleport-requests-grid]');
    const teleportReqEmpty = document.querySelector('[data-teleport-requests-empty]');
    const teleportRequests = teleportReqData.requests || [];
    if (teleportReqEmpty) teleportReqEmpty.hidden = teleportRequests.length !== 0;
    if (teleportReqGrid) {
      teleportReqGrid.innerHTML = '';
      teleportRequests.forEach((req) => teleportReqGrid.appendChild(buildTeleportRequestCard(req)));
    }
  } catch (error) {
    console.debug('Friends tab load failed:', error);
  }
};

document.querySelector('[data-friend-request-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const steamId = getSteamProfile()?.steamId;
  if (!steamId) {
    showToast('Sign in with Steam first.');
    return;
  }
  const targetInput = document.querySelector('[data-friend-target]');
  const toSteamId = extractSteamId(targetInput?.value);
  if (!/^\d{17}$/.test(toSteamId)) {
    showToast('Enter a valid 17-digit Steam ID.');
    return;
  }
  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const response = await fetch('/api/friend-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromSteamId: steamId, toSteamId }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showToast(data.error || 'Could not send that friend request.');
    } else {
      showToast('Friend request sent.');
      if (targetInput) targetInput.value = '';
    }
  } catch (error) {
    console.debug('Friend request failed:', error);
    showToast('Could not reach the server right now.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// Friends is a slide-out sidebar (same toggle mechanics as the chat
// sidebar, mirrored to the opposite edge) rather than a top-bar tab, so
// its data loads whenever it's opened instead of on a tab-button click.
const friendsToggle = document.getElementById('friendsToggle');
const friendsSidebar = document.getElementById('friendsSidebar');
const friendsClose = document.getElementById('friendsClose');

const openFriends = () => {
  friendsSidebar?.classList.add('is-open');
  friendsSidebar?.setAttribute('aria-hidden', 'false');
  friendsToggle?.setAttribute('aria-expanded', 'true');
  loadFriendsTabData();
};

const closeFriends = () => {
  friendsSidebar?.classList.remove('is-open');
  friendsSidebar?.setAttribute('aria-hidden', 'true');
  friendsToggle?.setAttribute('aria-expanded', 'false');
};

friendsToggle?.addEventListener('click', () => {
  const isOpen = friendsSidebar?.classList.contains('is-open');
  if (isOpen) {
    closeFriends();
  } else {
    openFriends();
  }
});

friendsClose?.addEventListener('click', closeFriends);

loadFriendsTabData();

