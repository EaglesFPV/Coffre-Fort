import { h } from '../lib/dom.js';

const root = () => document.getElementById('modal-root');

export function openModal(content) {
  const backdrop = h('div', {
    class: 'backdrop',
    onmousedown: (event) => {
      if (event.target === backdrop) closeModal();
    },
  }, content);
  root().replaceChildren(backdrop);
  content.querySelector('input, button.primary')?.focus();
}

export function closeModal() {
  root().replaceChildren();
}

export const isModalOpen = () => root().childElementCount > 0;

export function confirmModal({ title, text, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    const settle = (value) => {
      closeModal();
      resolve(value);
    };
    openModal(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('h2', null, title),
      h('p', null, text),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => settle(false) }, 'Annuler'),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => settle(true) }, confirmLabel))));
  });
}
