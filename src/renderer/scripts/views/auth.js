import { api } from '../api.js';
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { bindStrength, logo, passwordInput, setBusy, strengthMeter } from '../ui/components.js';
import { closeModal, openModal } from '../ui/modal.js';
import { enterVault } from './shell.js';

const MIN_LENGTH = 12;
const app = () => document.getElementById('app');

function masterInput(placeholder) {
  return h('input', {
    class: 'input large', type: 'password', placeholder, 'aria-label': placeholder,
    autocomplete: 'off', spellcheck: 'false',
  });
}

function layout(card, footer) {
  app().replaceChildren(h('div', { class: 'auth' },
    h('div', null, card, h('div', { class: 'auth-footer' }, icon('lock', 13), footer))));
}

export function showLock(message = '') {
  closeModal();
  const input = masterInput('Mot de passe maître');
  const feedback = h('div', { class: 'message' }, message);
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Déverrouiller');

  const form = h('form', {
    class: 'auth-card',
    onsubmit: async (event) => {
      event.preventDefault();
      if (!input.value || submit.disabled) return;
      setBusy(submit, true, 'Déverrouillage…');
      feedback.className = 'message';
      feedback.textContent = '';
      try {
        await api.vault.unlock(input.value);
        input.value = '';
        await enterVault();
      } catch (error) {
        setBusy(submit, false);
        input.value = '';
        feedback.className = 'message error';
        feedback.textContent = error.message;
        input.focus();
      }
    },
  },
  logo(),
  h('h1', null, 'Bon retour'),
  h('p', null, 'Entrez votre mot de passe maître pour déverrouiller votre coffre.'),
  h('div', { class: 'stack' }, passwordInput(input)),
  feedback,
  submit);

  layout(form, 'Chiffré sur cet ordinateur · aucune donnée ne quitte votre PC');
  input.focus();
}

function showWelcome() {
  openModal(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
    h('h2', null, 'Votre coffre est prêt'),
    h('div', { class: 'stack' },
      h('div', { class: 'notice' }, icon('alert', 16), h('span', null,
        "Écrivez votre mot de passe maître sur papier et rangez-le en lieu sûr, pas dans un fichier sur l'ordinateur. S'il est perdu, personne ne pourra ouvrir le coffre.")),
      h('p', { class: 'message' }, 'Pensez aussi à faire régulièrement une copie de sauvegarde : Paramètres › Sauvegarder une copie.')),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: closeModal }, "J'ai compris"))));
}

export function showSetup() {
  const first = masterInput('Mot de passe maître');
  const second = masterInput('Confirmez-le');
  const meter = strengthMeter();
  const feedback = h('div', { class: 'message error' });
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Créer mon coffre');
  bindStrength(first, meter);

  const form = h('form', {
    class: 'auth-card',
    onsubmit: async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      feedback.textContent = '';
      if ([...first.value].length < MIN_LENGTH) {
        feedback.textContent = `Le mot de passe maître doit contenir au moins ${MIN_LENGTH} caractères.`;
        return;
      }
      if (first.value !== second.value) {
        feedback.textContent = 'Les deux mots de passe ne correspondent pas.';
        return;
      }
      setBusy(submit, true, 'Création du coffre…');
      try {
        await api.vault.create(first.value);
        first.value = '';
        second.value = '';
        await enterVault();
        showWelcome();
      } catch (error) {
        setBusy(submit, false);
        feedback.textContent = error.message;
      }
    },
  },
  logo(),
  h('h1', null, 'Créez votre coffre'),
  h('p', null, 'Choisissez un mot de passe maître : ce sera le seul à retenir. Le plus sûr : une phrase de 5 ou 6 mots sans rapport entre eux.'),
  h('div', { class: 'stack' },
    h('div', null, passwordInput(first), meter),
    passwordInput(second),
    h('div', { class: 'notice' }, icon('alert', 16),
      h('span', null, "Si vous l'oubliez, vos données seront perdues pour toujours : il n'existe aucun moyen de récupération."))),
  feedback,
  submit);

  layout(form, 'Argon2id + AES-256 · vos données ne quittent jamais cet ordinateur');
  first.focus();
}
