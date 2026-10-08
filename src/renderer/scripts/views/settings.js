import { api } from '../api.js';
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { formatDate } from '../lib/format.js';
import { state } from '../state.js';
import { bindStrength, pageHead, passwordInput, setBusy, strengthMeter } from '../ui/components.js';
import { attempt, toast } from '../ui/feedback.js';
import { closeModal, openModal } from '../ui/modal.js';
import { promptMasterPassword } from '../ui/master-password.js';
import { describeUpdate } from '../ui/update-banner.js';
import { renderContent } from './shell.js';

const AUTO_LOCK_CHOICES = Object.freeze([[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 heure']]);
const CLIPBOARD_CHOICES = Object.freeze([[10, '10 secondes'], [20, '20 secondes'], [30, '30 secondes'], [60, '1 minute'], [120, '2 minutes']]);
const PROTECTION_CHOICES = Object.freeze([
  ['standard', 'Standard', '64 Mio par essai, déverrouillage rapide (~0,5 s)'],
  ['reinforced', 'Renforcé', '256 Mio par essai, recommandé (~1 à 2 s)'],
  ['maximal', 'Maximal', '512 Mio par essai, pour les plus prudents (~3 à 5 s)'],
]);
const SHORTCUT_CHOICES = Object.freeze([
  ['none', 'Aucun'],
  ['ctrl-alt-k', 'Ctrl + Alt + K'],
  ['ctrl-shift-k', 'Ctrl + Maj + K'],
  ['ctrl-alt-v', 'Ctrl + Alt + V'],
  ['ctrl-shift-space', 'Ctrl + Maj + Espace'],
]);

function setting(title, description, control, descriptionClass) {
  const details = description instanceof HTMLOListElement ? description : h('span', { class: descriptionClass }, description);
  return h('div', { class: 'setting' }, h('div', { class: 'text' }, h('strong', null, title), details), control);
}

function select(label, choices, current, onChange) {
  return h('select', { class: 'input', 'aria-label': label, onchange: (event) => onChange(event.target.value) },
    choices.map(([value, text]) => {
      const option = h('option', { value: String(value) }, text);
      option.selected = String(value) === String(current);
      return option;
    }));
}

function toggle(label, checked, onChange, disabled = false) {
  return h('input', {
    type: 'checkbox', class: 'switch', 'aria-label': label, checked, disabled,
    onchange: (event) => onChange(event.target.checked, event.target),
  });
}

async function updateVaultSetting(changes, message) {
  await attempt(async () => {
    await api.vault.updateSettings(changes);
    Object.assign(state.settings, changes);
    toast(message);
  });
}

async function updatePreferences(changes, message) {
  try {
    state.appInfo.preferences = await api.app.updatePreferences(changes);
    toast(message);
  } catch (error) {
    toast(error.message, { iconName: 'alert', error: true });
  }
  renderContent();
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

async function changeProtection(level) {
  const choice = PROTECTION_CHOICES.find(([value]) => value === level);
  const confirmed = await promptMasterPassword({
    title: `Protection « ${choice[1]} »`,
    text: `${choice[2]}. Le coffre va être chiffré à nouveau : confirmez avec votre mot de passe maître.`,
    confirm: (password) => api.vault.changeProtectionLevel(password, level),
  });
  if (confirmed) {
    state.protectionLevel = level;
    toast('Niveau de protection mis à jour');
  }
  renderContent();
}

function securityCard() {
  const settings = state.settings;
  const currentProtection = PROTECTION_CHOICES.find(([value]) => value === state.protectionLevel);
  return h('div', { class: 'card' },
    h('h3', null, 'Sécurité'),
    setting('Mot de passe maître', "Le seul mot de passe à retenir. Changez-le si vous pensez qu'il a pu être vu.",
      h('button', { class: 'btn', type: 'button', onclick: changeMasterPasswordModal }, 'Changer…')),
    setting('Niveau de protection', currentProtection ? currentProtection[2] : 'Paramètres personnalisés.',
      select('Niveau de protection', PROTECTION_CHOICES.map(([value, label]) => [value, label]), state.protectionLevel, changeProtection)),
    setting('Exiger le mot de passe maître', 'Avant d’afficher, copier ou modifier un mot de passe ou une note. Redemandé après 2 minutes.',
      toggle('Exiger le mot de passe maître', settings.requireMasterPassword, (value) => updateVaultSetting({ requireMasterPassword: value },
        value ? 'Mot de passe maître exigé pour les secrets' : 'Mot de passe maître non exigé'))),
    setting('Verrouillage automatique', 'Après cette durée sans utilisation, ainsi qu’au verrouillage de Windows et en veille.',
      select('Délai de verrouillage', AUTO_LOCK_CHOICES, settings.autoLockMinutes,
        (value) => updateVaultSetting({ autoLockMinutes: Number(value) }, 'Délai de verrouillage enregistré'))),
    setting('Verrouiller en réduisant la fenêtre', 'Le coffre se verrouille dès que la fenêtre est réduite ou cachée.',
      toggle('Verrouiller en réduisant', settings.lockOnMinimize, (value) => updateVaultSetting({ lockOnMinimize: value },
        value ? 'Verrouillage à la réduction activé' : 'Verrouillage à la réduction désactivé'))),
    setting('Effacement du presse-papiers', 'Délai avant que les identifiants et mots de passe copiés soient effacés.',
      select('Effacement du presse-papiers', CLIPBOARD_CHOICES, settings.clipboardSeconds,
        (value) => updateVaultSetting({ clipboardSeconds: Number(value) }, 'Délai du presse-papiers enregistré'))));
}

function systemCard() {
  const info = state.appInfo;
  const preferences = info.preferences;
  return h('div', { class: 'card' },
    h('h3', null, 'Système'),
    setting('Lancer au démarrage de Windows',
      info.packaged ? 'Coffre-Fort démarre verrouillé, discrètement dans la zone de notification.' : 'Disponible dans la version installée.',
      toggle('Lancer au démarrage', preferences.launchAtStartup, (value) => updatePreferences({ launchAtStartup: value },
        value ? 'Lancement au démarrage activé' : 'Lancement au démarrage désactivé'), !info.packaged)),
    setting('Icône dans la zone de notification', 'Accès rapide pour ouvrir ou verrouiller le coffre, à côté de l’horloge.',
      toggle('Icône dans la zone de notification', preferences.showTray, (value) => updatePreferences({ showTray: value },
        value ? 'Icône affichée' : 'Icône masquée'))),
    setting('Réduire au lieu de fermer', 'La croix cache la fenêtre dans la zone de notification ; « Quitter » ferme vraiment.',
      toggle('Réduire au lieu de fermer', preferences.closeToTray, (value) => updatePreferences({ closeToTray: value },
        value ? 'La croix réduit maintenant la fenêtre' : 'La croix ferme maintenant l’application'), !preferences.showTray)),
    setting('Raccourci global', 'Ouvre Coffre-Fort depuis n’importe quelle application.',
      select('Raccourci global', SHORTCUT_CHOICES, preferences.globalShortcut,
        (value) => updatePreferences({ globalShortcut: value }, value === 'none' ? 'Raccourci désactivé' : 'Raccourci enregistré'))));
}

function browserDetails(info) {
  const steps = h('ol', { class: 'steps' },
    h('li', null, 'Dans Edge, ouvrez ', h('code', { class: 'selectable' }, 'edge://extensions'), ' et activez le « Mode développeur » (Chrome et Brave : ', h('code', { class: 'selectable' }, 'chrome://extensions'), ').'),
    h('li', null, 'Cliquez sur « Charger l’élément décompressé » et choisissez ce dossier : ', h('code', { class: 'selectable' }, info.extensionDir)),
    h('li', null, 'Cliquez sur l’icône Coffre-Fort du navigateur, puis sur « Associer ce navigateur ».'));

  const browsers = info.browsers.length
    ? info.browsers.map((browser) => setting(browser.name, `Associé le ${formatDate(browser.created)}`,
      h('button', {
        class: 'btn danger',
        type: 'button',
        onclick: () => attempt(async () => {
          await api.browser.unpair(browser.id);
          toast('Navigateur dissocié');
          renderContent();
        }),
      }, 'Dissocier')))
    : [h('div', { class: 'setting' }, h('div', { class: 'text' }, h('span', null, 'Aucun navigateur associé pour le moment.')))];

  return [
    setting('Installer l’extension', steps,
      h('button', { class: 'btn', type: 'button', onclick: () => attempt(() => api.browser.openExtensionFolder()) }, icon('folder', 16), 'Ouvrir le dossier')),
    ...browsers,
  ];
}

function browserCard() {
  const preferences = state.appInfo.preferences;
  const card = h('div', { class: 'card' },
    h('h3', null, 'Navigateur'),
    setting('Extension de navigateur',
      'Remplit vos identifiants dans Edge, Chrome ou Brave : uniquement sur le site enregistré, à votre demande, et quand le coffre est déverrouillé.',
      toggle('Extension de navigateur', preferences.browserIntegration, (value) => updatePreferences({ browserIntegration: value },
        value ? 'Liaison avec le navigateur activée' : 'Liaison avec le navigateur désactivée'))));
  if (preferences.browserIntegration) {
    api.browser.state().then((info) => card.append(...browserDetails(info))).catch(() => {});
  }
  return card;
}

function backupCard() {
  return h('div', { class: 'card' },
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
      'path'));
}

function aboutCard() {
  const info = state.appInfo;
  const status = h('span', null, describeUpdate(state.update));
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
    setting(`Coffre-Fort ${info.version}`, status, checkButton),
    setting('Mises à jour automatiques', "Téléchargées en arrière-plan depuis GitHub, installées en silence à la fermeture de l'application.",
      toggle('Mises à jour automatiques', info.preferences.autoUpdate, (value) => updatePreferences({ autoUpdate: value },
        value ? 'Mises à jour automatiques activées' : 'Mises à jour automatiques désactivées'))));
}

function protectionsCard() {
  const protections = [
    'Chiffrement AES-256-GCM : toute modification du fichier est détectée',
    'Mot de passe maître renforcé par Argon2id',
    `Presse-papiers exclu de l'historique Windows et du cloud, effacé après ${state.settings.clipboardSeconds} s`,
    "Fenêtre invisible dans les captures et partages d'écran",
    'Verrouillage automatique, avec Windows et à la mise en veille',
    "Interface isolée d'Internet ; seule la recherche de mises à jour contacte GitHub",
  ];
  return h('div', { class: 'card' },
    h('h3', null, 'Protections actives'),
    h('ul', { class: 'checks' }, protections.map((text) => h('li', null, icon('check', 16), text))));
}

export function renderSettings(content) {
  content.append(pageHead('Paramètres'), securityCard(), browserCard(), systemCard(), backupCard(), aboutCard(), protectionsCard());
}
