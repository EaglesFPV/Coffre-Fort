import { api } from '../api.js';
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { state } from '../state.js';
import { bindStrength, pageHead, passwordInput, setBusy, strengthMeter } from '../ui/components.js';
import { attempt, toast } from '../ui/feedback.js';
import { closeModal, openModal } from '../ui/modal.js';
import { describeUpdate } from '../ui/update-banner.js';

const AUTO_LOCK_CHOICES = Object.freeze([1, 5, 15, 30, 60]);

const PROTECTIONS = Object.freeze([
  'Chiffrement AES-256-GCM : toute modification du fichier est détectée',
  'Mot de passe maître renforcé par Argon2id (256 Mio de mémoire par essai)',
  "Presse-papiers exclu de l'historique Windows et du cloud, effacé après 20 s",
  "Fenêtre invisible dans les captures et partages d'écran",
  'Verrouillage automatique, avec Windows et à la mise en veille',
  "Interface isolée d'Internet ; seule la recherche de mises à jour contacte GitHub",
]);

function setting(title, description, control, descriptionClass) {
  return h('div', { class: 'setting' },
    h('div', { class: 'text' }, h('strong', null, title), h('span', { class: descriptionClass }, description)),
    control);
}

function changeMasterPasswordModal() {
  const current = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'Mot de passe actuel' });
  const next = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'Nouveau mot de passe maître' });
  const confirmation = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'Confirmez le nouveau' });
  const meter = strengthMeter();
  const feedback = h('div', { class: 'message error' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Changer');
  bindStrength(next, meter);

  openModal(h('form', {
    class: 'modal',
    role: 'dialog',
    'aria-modal': 'true',
    onsubmit: async (event) => {
      event.preventDefault();
      feedback.textContent = '';
      if (next.value !== confirmation.value) {
        feedback.textContent = 'Les deux nouveaux mots de passe ne correspondent pas.';
        return;
      }
      setBusy(submit, true, 'Changement…');
      try {
        await api.vault.changeMasterPassword(current.value, next.value);
        closeModal();
        toast('Mot de passe maître changé');
      } catch (error) {
        setBusy(submit, false);
        feedback.textContent = error.message;
      }
    },
  },
  h('h2', null, 'Changer le mot de passe maître'),
  h('p', null, "Les copies de sauvegarde faites avant ce changement resteront ouvrables avec l'ancien mot de passe."),
  h('div', { class: 'stack' }, passwordInput(current), h('div', null, passwordInput(next), meter), passwordInput(confirmation)),
  feedback,
  h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: closeModal }, 'Annuler'), submit)));
}

function autoLockSelect() {
  return h('select', {
    class: 'input',
    'aria-label': 'Délai de verrouillage',
    onchange: (event) => attempt(async () => {
      const minutes = Number(event.target.value);
      await api.vault.updateSettings({ autoLockMinutes: minutes });
      state.settings.autoLockMinutes = minutes;
      toast('Délai de verrouillage enregistré');
    }),
  }, AUTO_LOCK_CHOICES.map((minutes) => {
    const option = h('option', { value: String(minutes) }, minutes === 60 ? '1 heure' : `${minutes} minute${minutes > 1 ? 's' : ''}`);
    option.selected = minutes === state.settings.autoLockMinutes;
    return option;
  }));
}

function updateSection() {
  const info = state.appInfo;
  const status = h('span', null, describeUpdate(state.update));
  const autoUpdate = h('input', {
    type: 'checkbox',
    class: 'switch',
    checked: info?.preferences.autoUpdate,
    'aria-label': 'Mises à jour automatiques',
    onchange: (event) => attempt(async () => {
      info.preferences = await api.app.updatePreferences({ autoUpdate: event.target.checked });
      toast(event.target.checked ? 'Mises à jour automatiques activées' : 'Mises à jour automatiques désactivées');
    }),
  });
  const checkButton = h('button', {
    class: 'btn',
    type: 'button',
    onclick: () => attempt(async () => {
      state.update = await api.app.checkForUpdates();
      status.textContent = describeUpdate(state.update);
    }),
  }, icon('refresh', 16), 'Rechercher');

  return h('div', { class: 'card' },
    h('h3', null, 'À propos'),
    setting(`Coffre-Fort ${info?.version ?? ''}`, status, checkButton),
    setting('Mises à jour automatiques', "Téléchargées en arrière-plan depuis GitHub, installées à la fermeture de l'application.", autoUpdate));
}

export function renderSettings(content) {
  content.append(
    pageHead('Paramètres'),
    h('div', { class: 'card' },
      h('h3', null, 'Sécurité'),
      setting('Mot de passe maître', "Le seul mot de passe à retenir. Changez-le si vous pensez qu'il a pu être vu.",
        h('button', { class: 'btn', type: 'button', onclick: changeMasterPasswordModal }, 'Changer…')),
      setting('Verrouillage automatique', 'Après cette durée sans utilisation. Le coffre se verrouille aussi avec Windows et en veille.', autoLockSelect())),
    h('div', { class: 'card' },
      h('h3', null, 'Sauvegarde'),
      setting('Copie de sauvegarde', "Copie chiffrée, à garder sur une clé USB ou un disque externe. Elle s'ouvre avec le mot de passe maître actuel.",
        h('button', {
          class: 'btn',
          type: 'button',
          onclick: async () => {
            const saved = await attempt(() => api.vault.backup());
            if (saved) toast('Copie de sauvegarde enregistrée', { iconName: 'download' });
          },
        }, icon('download', 16), 'Sauvegarder une copie…')),
      setting('Emplacement du coffre', state.vaultPath,
        h('button', { class: 'btn', type: 'button', onclick: () => attempt(() => api.vault.openFolder()) }, icon('folder', 16), 'Ouvrir le dossier'),
        'path')),
    updateSection(),
    h('div', { class: 'card' },
      h('h3', null, 'Protections actives'),
      h('ul', { class: 'checks' }, PROTECTIONS.map((text) => h('li', null, icon('check', 16), text)))));
}
