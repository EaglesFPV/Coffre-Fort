import { api } from './api.js';
import { LOCK_MESSAGES, resetSession, state } from './state.js';
import { hideToast, toast, toastError } from './ui/feedback.js';
import { promptMasterPassword } from './ui/master-password.js';
import { closeModal } from './ui/modal.js';
import { renderUpdateBanner } from './ui/update-banner.js';
import { installShortcuts } from './shortcuts.js';
import { showLock, showSetup } from './views/auth.js';
import { enterVault } from './views/shell.js';

const ACTIVITY_PING_MS = 15_000;

function trackActivity() {
  let lastPing = 0;
  for (const type of ['mousemove', 'mousedown', 'keydown', 'wheel']) {
    window.addEventListener(type, () => {
      if (!state.dom || Date.now() - lastPing < ACTIVITY_PING_MS) return;
      lastPing = Date.now();
      api.vault.activity().catch(() => {});
    }, { passive: true });
  }
}

function subscribeToEvents() {
  api.events.onLocked((reason) => {
    closeModal();
    hideToast();
    resetSession();
    showLock(LOCK_MESSAGES[reason] ?? '');
  });
  api.events.onClipboardCleared(() => toast('Presse-papiers effacé'));
  api.events.onUpdateStatus((status) => {
    state.update = status;
    renderUpdateBanner();
  });
  api.events.onMasterPasswordRequested(async () => {
    if (!state.dom) return;
    const confirmed = await promptMasterPassword({
      title: 'Demande du navigateur',
      text: "L'extension veut remplir un identifiant. Confirmez avec votre mot de passe maître, puis recommencez dans le navigateur.",
    });
    if (confirmed) toast('Confirmé : vous pouvez remplir depuis le navigateur');
  });
}

async function boot() {
  subscribeToEvents();
  trackActivity();
  installShortcuts();

  const [vaultState, info] = await Promise.all([api.vault.state(), api.app.info()]);
  state.vaultPath = vaultState.path;
  state.appInfo = info;
  state.update = info.update;
  renderUpdateBanner();

  if (vaultState.unlocked) await enterVault();
  else if (vaultState.exists) showLock();
  else showSetup();
}

boot().catch(toastError);
