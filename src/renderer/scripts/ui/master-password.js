import { api } from '../api.js';
import { h } from '../lib/dom.js';
import { passwordInput, setBusy } from './components.js';
import { closeModal, openModal } from './modal.js';

export function promptMasterPassword({ title = 'Confirmez votre identité', text = 'Entrez votre mot de passe maître pour afficher ou copier ce secret.', confirm = api.vault.confirmMasterPassword } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'Mot de passe maître', 'aria-label': 'Mot de passe maître' });
    const feedback = h('div', { class: 'message error' });
    const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Confirmer');
    const finish = (value) => {
      resolve(value);
      closeModal();
    };

    openModal(h('form', {
      class: 'modal',
      role: 'dialog',
      'aria-modal': 'true',
      onsubmit: async (event) => {
        event.preventDefault();
        if (!input.value || submit.disabled) return;
        setBusy(submit, true, 'Vérification…');
        try {
          await confirm(input.value);
          input.value = '';
          finish(true);
        } catch (error) {
          setBusy(submit, false);
          input.value = '';
          feedback.textContent = error.message;
          input.focus();
        }
      },
      onkeydown: (event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          finish(false);
        }
      },
    },
    h('h2', null, title),
    h('p', null, text),
    h('div', { class: 'stack' }, passwordInput(input)),
    feedback,
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => finish(false) }, 'Annuler'),
      submit)),
    () => resolve(false));
  });
}

export async function withMasterPassword(task) {
  const result = await task();
  if (!result?.requiresMasterPassword) return result;
  if (!(await promptMasterPassword())) return null;
  return task();
}
