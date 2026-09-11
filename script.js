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
    } else {
      headerSteamBtn.textContent = 'Steam';
      headerSteamBtn.href = '/api/steam-login';
    }
  }
  if (connectSteamBtn) connectSteamBtn.hidden = !!profile;

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

  if (params.get('discord_error')) {
    showToast('Discord login failed. Make sure you are in the Levels Discord server.');
  } else if (discordId && discordName && discordRole) {
    setDiscordProfile(discordId, discordName, discordRole);
    showToast('Discord permissions connected successfully!');
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
  renderWebsiteChatLog();
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

  const messages = getChatMessages();
  chatLog.replaceChildren();
  if (!messages.length) {
    chatLog.textContent = 'No website chat messages have been recorded on this device.';
    return;
  }

  messages.slice(-20).reverse().forEach((message) => {
    const entry = document.createElement('div');
    entry.className = 'ticket-log-entry';
    const meta = document.createElement('span');
    meta.textContent = `${message.name} - ${formatLogTime(message.ts)}`;
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

const updateParkButtonForLiveState = (isAlive) => {
  const btn = document.querySelector('[data-park-dino]');
  if (!btn || PARK_BUTTON_BUSY_LABELS.has(btn.textContent)) return;
  btn.disabled = !isAlive;
  btn.textContent = isAlive ? 'Park Dino' : 'Dino not alive';
};

const renderLiveDino = (dino) => {
  updateParkButtonForLiveState((dino.health || 0) > 0);

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
    document.querySelectorAll(`[data-dino-value="${stat}"]`).forEach((value) => {
      value.textContent = `${clamped}%`;
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

  if (entry.primeElder) {
    const prime = document.createElement('span');
    prime.className = 'parked-prime-badge';
    prime.textContent = 'Prime';
    badges.appendChild(prime);
  } else {
    badges.appendChild(document.createElement('span'));
  }

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

  const details = document.createElement('div');
  details.className = 'parked-details';
  details.hidden = true;

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
  details.appendChild(detailStats);

  // Redeeming someone else's dino makes no sense, so the button is only
  // offered for the viewer's own cards. The API still only trusts the
  // client-supplied steamId either way — same trust model the rest of this
  // site already uses (/api/live-dino, the old inventory API), not a new gap.
  const viewerSteamId = getSteamProfile()?.steamId;
  if (entry.steam && viewerSteamId && entry.steam === viewerSteamId) {
    const renameRow = document.createElement('div');
    renameRow.className = 'parked-rename-row';
    renameRow.addEventListener('click', (event) => event.stopPropagation());

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
    details.appendChild(renameRow);

    const redeemButton = document.createElement('button');
    redeemButton.type = 'button';
    redeemButton.className = 'action-button small parked-redeem-button';
    redeemButton.textContent = 'Redeem';
    redeemButton.addEventListener('click', (event) => {
      event.stopPropagation();
      requestRedeem(entry, redeemButton);
    });
    details.appendChild(redeemButton);

    const releaseButton = document.createElement('button');
    releaseButton.type = 'button';
    releaseButton.className = 'action-button small parked-release-button';
    releaseButton.textContent = 'Release to the wild';
    releaseButton.addEventListener('click', async (event) => {
      event.stopPropagation();
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
      } catch (error) {
        console.debug('Release failed:', error);
        showToast('Could not reach the server right now.');
        releaseButton.disabled = false;
      }
    });
    details.appendChild(releaseButton);
  }

  card.append(badges, image, species, titleRow, growthBar, stats, details);
  card.addEventListener('click', () => {
    details.hidden = !details.hidden;
    card.classList.toggle('is-expanded', !details.hidden);
  });
  return card;
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

const attachPlayerAutocomplete = (inputEl) => {
  if (!inputEl) return;
  const suggestionsEl = inputEl.closest('.player-search')?.querySelector('[data-player-suggestions]');
  if (!suggestionsEl) return;

  const hideSuggestions = () => {
    suggestionsEl.hidden = true;
    suggestionsEl.innerHTML = '';
  };

  const renderSuggestions = () => {
    const query = inputEl.value.trim().toLowerCase();
    if (!query || /^\d+$/.test(query)) {
      hideSuggestions();
      return;
    }
    const matches = playerDirectory
      .filter((p) => String(p.name || '').toLowerCase().includes(query))
      .slice(0, 8);
    if (matches.length === 0) {
      hideSuggestions();
      return;
    }
    suggestionsEl.innerHTML = matches.map((p) => `
      <div class="player-suggestion" data-steam-id="${p.steamId}">
        ${String(p.name).replace(/</g, '&lt;')}
        <small>${p.steamId}</small>
      </div>
    `).join('');
    suggestionsEl.hidden = false;
  };

  inputEl.addEventListener('input', renderSuggestions);
  inputEl.addEventListener('focus', renderSuggestions);
  // mousedown (not click) fires before the input's blur, and preventDefault
  // here stops that blur from happening at all — so hideSuggestions() below
  // is the only thing that closes the dropdown, rather than a race between
  // blur-hides-it and click-tries-to-read-it-first.
  suggestionsEl.addEventListener('mousedown', (event) => {
    const row = event.target.closest('[data-steam-id]');
    if (!row) return;
    event.preventDefault();
    inputEl.value = row.dataset.steamId;
    hideSuggestions();
  });
  inputEl.addEventListener('blur', () => {
    setTimeout(hideSuggestions, 150);
  });
};

['[data-comp-target]', '[data-strike-target]', '[data-skin-target]'].forEach((selector) => {
  attachPlayerAutocomplete(document.querySelector(selector));
});

const checkAdminPanelAccess = async () => {
  const adminPanelTabButton = document.querySelector('.admin-panel-tab-button');
  const adminPanelPanel = document.getElementById('admin-panel');
  const profile = getSteamProfile();
  if (!profile?.steamId) {
    if (adminPanelTabButton) adminPanelTabButton.hidden = true;
    if (adminPanelPanel) adminPanelPanel.hidden = true;
    return;
  }
  try {
    const response = await fetch(`/api/admin-status?steam_id=${encodeURIComponent(profile.steamId)}`);
    const data = await response.json();
    const hasAccess = Boolean(data.tier);
    if (adminPanelTabButton) adminPanelTabButton.hidden = !hasAccess;
    if (adminPanelPanel) adminPanelPanel.hidden = !hasAccess;
    if (hasAccess) loadPlayerDirectory();
  } catch (error) {
    console.debug('Admin panel access check failed:', error);
  }
};

checkAdminPanelAccess();

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
  const body = {
    granterSteamId: profile.steamId,
    targetSteamId,
    species: document.querySelector('[data-comp-species]')?.value,
    growthPct: Number(document.querySelector('[data-comp-growth]')?.value),
    healthPct: Number(document.querySelector('[data-comp-health]')?.value),
    staminaPct: Number(document.querySelector('[data-comp-stamina]')?.value),
    hungerPct: Number(document.querySelector('[data-comp-hunger]')?.value),
    thirstPct: Number(document.querySelector('[data-comp-thirst]')?.value),
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
    }
  } catch (error) {
    console.debug('Compensation grant failed:', error);
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
const loadStaffRoster = async () => {
  const rosterEl = document.querySelector('[data-staff-roster]');
  if (!rosterEl) return;
  try {
    const response = await fetch('/api/staff-roster');
    const data = await response.json();
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
  } catch (error) {
    console.debug('Staff roster load failed:', error);
  }
};

document.querySelector('[data-tab="community"]')?.addEventListener('click', loadStaffRoster);
loadStaffRoster();

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
  name.textContent = req.fromSteamId;

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

const buildFriendCard = (friend) => {
  const card = document.createElement('article');
  card.className = 'parked-card friend-card';

  const name = document.createElement('h3');
  name.className = 'friend-card-name';
  name.textContent = friend.steamId;

  const meta = document.createElement('p');
  meta.className = 'friend-card-meta';
  meta.textContent = friend.since ? `Friends since ${new Date(friend.since).toLocaleDateString()}` : 'Friends';

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
    if (!window.confirm(`Remove ${friend.steamId} from your friends?`)) return;
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

  actions.append(toThemBtn, bringBtn, removeBtn);
  card.append(name, meta, actions);
  return card;
};

const buildTeleportRequestCard = (req) => {
  const card = document.createElement('article');
  card.className = 'parked-card request-card';

  const name = document.createElement('h3');
  name.className = 'request-card-name';
  name.textContent = req.fromSteamId;

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

    const friendsGrid = document.querySelector('[data-friends-grid]');
    const friendsEmpty = document.querySelector('[data-friends-empty]');
    const friends = friendsData.friends || [];
    if (friendsEmpty) friendsEmpty.hidden = friends.length !== 0;
    if (friendsGrid) {
      friendsGrid.innerHTML = '';
      friends.forEach((friend) => friendsGrid.appendChild(buildFriendCard(friend)));
    }

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
  const toSteamId = targetInput?.value.trim() || '';
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

document.querySelector('[data-tab="friends"]')?.addEventListener('click', loadFriendsTabData);
loadFriendsTabData();
