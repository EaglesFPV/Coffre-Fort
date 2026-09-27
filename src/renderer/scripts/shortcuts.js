import { api } from './api.js';
import { state } from './state.js';
import { closeModal, isModalOpen } from './ui/modal.js';
import { closePanel, newItem } from './views/panel.js';

function onKeyDown(event) {
  if (!state.dom) return;
  const key = event.key.toLowerCase();

  if (event.ctrlKey && key === 'l') {
    event.preventDefault();
    api.vault.lock();
    return;
  }
  if (isModalOpen()) {
    if (event.key === 'Escape') closeModal();
    return;
  }
  if (event.ctrlKey && key === 'f') {
    event.preventDefault();
    state.dom.search.focus();
    state.dom.search.select();
  } else if (event.ctrlKey && key === 'n') {
    event.preventDefault();
    newItem(state.view === 'notes' ? 'note' : 'login');
  } else if (event.key === 'Escape' && state.panel?.mode === 'view') {
    closePanel();
  }
}

function closeMenusOnOutsideClick(event) {
  if (!event.target.closest('.dropdown')) document.querySelectorAll('.menu').forEach((menu) => menu.remove());
}

export function installShortcuts() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('mousedown', closeMenusOnOutsideClick);
}
