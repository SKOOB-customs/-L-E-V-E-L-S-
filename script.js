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
