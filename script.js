const toast = document.getElementById('toast');
let toastTimer = null;

const discordMemberStorageKey = 'levelsDiscordMemberCount';

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

const showToast = (message) => {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
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
};

if (tabButtons.length) {
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activateTab(button.dataset.tab);
    });
  });

  const hashTab = window.location.hash.replace('#', '').split('?')[0];
  const hasHashTab = [...tabButtons].some((button) => button.dataset.tab === hashTab);
  activateTab(hasHashTab ? hashTab : 'gallery');
}

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
const staffStorageKey = 'levelsStaffList';

const defaultStaffList = [
  { steamId: '76561198000000001', role: 'Owner' },
  { steamId: '76561198000000002', role: 'Admin' },
];

const getStaffList = () => {
  try {
    const saved = localStorage.getItem(staffStorageKey);
    return saved ? JSON.parse(saved) : defaultStaffList;
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

const roleDetailsMap = {
  Owner: { badge: '👑 Owner', perms: ['admin', 'cheat', 'kick', 'ban', 'teleport', 'spawn', 'manage_permissions'] },
  Admin: { badge: '🛡️ Admin', perms: ['admin', 'cheat', 'kick', 'ban', 'teleport', 'spawn'] },
  Moderator: { badge: '⚔️ Moderator', perms: ['kick', 'ban', 'teleport', 'mute'] },
  Staff: { badge: '⭐ Staff', perms: ['teleport', 'kick', 'mute'] },
  Player: { badge: '🎮 Player', perms: [] },
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
    info.innerHTML = `<strong>${member.role}</strong> &mdash; <code>${member.steamId}</code>`;

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

const displaySteamStatus = async () => {
  const profile = getSteamProfile();
  const statusDiv = document.getElementById('profileStatus');
  const statusMessage = document.getElementById('statusMessage');
  const staffRoleBadge = document.getElementById('staffRoleBadge');
  const staffPermsList = document.getElementById('staffPermsList');

  if (!statusDiv || !statusMessage) return;

  if (profile) {
    statusDiv.style.display = 'block';
    statusMessage.innerHTML = `✓ <strong>Steam Account Connected!</strong><br>ID: <code>${profile.steamId}</code><br>Username: <strong>${profile.username}</strong>`;

    // Check staff permissions either from local list or API
    const staffList = getStaffList();
    const matchedStaff = staffList.find((s) => s.steamId === profile.steamId);
    let activeRole = matchedStaff ? matchedStaff.role : (profile.staffRole || 'Player');

    // Attempt API verification for latest server permissions
    try {
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
  }
};

// Handle adding new staff Steam IDs
const addStaffForm = document.getElementById('addStaffForm');
if (addStaffForm) {
  addStaffForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const steamIdInput = document.getElementById('staffSteamIdInput');
    const roleSelect = document.getElementById('staffRoleSelect');

    const steamId = steamIdInput?.value.trim();
    const role = roleSelect?.value || 'Admin';

    if (!steamId || !/^\d{17}$/.test(steamId)) {
      showToast('Please enter a valid 17-digit SteamID64.');
      return;
    }

    const staffList = getStaffList();
    const existingIndex = staffList.findIndex((s) => s.steamId === steamId);

    if (existingIndex >= 0) {
      staffList[existingIndex].role = role;
    } else {
      staffList.push({ steamId, role });
    }

    saveStaffList(staffList);
    steamIdInput.value = '';
    showToast(`Saved ${role} permissions for Steam ID ${steamId}!`);
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

  if (params.get('steam_error')) {
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

// Global chat sidebar (local-only: no backend yet, so messages persist per browser)
const chatToggle = document.getElementById('chatToggle');
const chatSidebar = document.getElementById('chatSidebar');
const chatClose = document.getElementById('chatClose');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatNameInput = document.getElementById('chatName');
const chatTextInput = document.getElementById('chatText');
const chatHoneypot = document.getElementById('chatWebsite');

const chatMessagesKey = 'levelsChatMessages';
const chatNameKey = 'levelsChatName';
const chatMaxStored = 100;
const chatMinIntervalMs = 1500;
let lastChatSendAt = 0;

const getChatMessages = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(chatMessagesKey) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const renderChatMessages = () => {
  if (!chatMessages) return;
  const messages = getChatMessages();
  chatMessages.innerHTML = '';

  messages.forEach((message) => {
    const item = document.createElement('div');
    item.className = 'chat-message';

    const user = document.createElement('span');
    user.className = 'chat-message-user';
    user.textContent = message.name;

    const time = document.createElement('span');
    time.className = 'chat-message-time';
    time.textContent = new Date(message.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const text = document.createElement('span');
    text.className = 'chat-message-text';
    text.textContent = message.text;

    item.append(user, time, document.createElement('br'), text);
    chatMessages.appendChild(item);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
};

const addChatMessage = (name, text) => {
  const messages = getChatMessages();
  messages.push({ name, text, ts: Date.now() });
  localStorage.setItem(chatMessagesKey, JSON.stringify(messages.slice(-chatMaxStored)));
  renderChatMessages();
};

const openChat = () => {
  chatSidebar?.classList.add('is-open');
  chatSidebar?.setAttribute('aria-hidden', 'false');
  chatToggle?.setAttribute('aria-expanded', 'true');
};

const closeChat = () => {
  chatSidebar?.classList.remove('is-open');
  chatSidebar?.setAttribute('aria-hidden', 'true');
  chatToggle?.setAttribute('aria-expanded', 'false');
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

if (chatNameInput) {
  chatNameInput.value = localStorage.getItem(chatNameKey) || '';
}

chatForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  // Bots tend to fill every field, including the hidden honeypot; humans never see it
  if (chatHoneypot && chatHoneypot.value) {
    return;
  }

  const now = Date.now();
  if (now - lastChatSendAt < chatMinIntervalMs) {
    showToast('You are sending messages too quickly.');
    return;
  }

  const name = chatNameInput?.value.trim().slice(0, 24);
  const text = chatTextInput?.value.trim().slice(0, 240);

  if (!name || !text) return;

  localStorage.setItem(chatNameKey, name);
  addChatMessage(name, text);

  lastChatSendAt = now;
  if (chatTextInput) {
    chatTextInput.value = '';
    chatTextInput.focus();
  }
});

renderChatMessages();
