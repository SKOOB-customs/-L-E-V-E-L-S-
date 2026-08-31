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

  activateTab('gallery');
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
