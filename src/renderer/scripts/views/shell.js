import { api } from '../api.js';
import { append, h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { NOTE_COLOR, PALETTE, colorFor } from '../lib/format.js';
import { state } from '../state.js';
import { logo } from '../ui/components.js';
import { renderItems } from './items.js';
import { closePanel, newItem } from './panel.js';
import { renderHealth } from './health.js';
import { renderGenerator } from './generator.js';
import { renderSettings } from './settings.js';
import { IDENTITY_COLOR, editIdentity, renderIdentities } from './identities.js';

const PAGES = {
  logins: renderItems,
  notes: renderItems,
  identities: renderIdentities,
  health: renderHealth,
  generator: renderGenerator,
  settings: renderSettings,
};

export const isListView = () => state.view === 'logins' || state.view === 'notes';

export async function loadData() {
  const snapshot = await api.items.list();
  state.items = snapshot.items;
  state.identities = snapshot.identities;
  state.health = snapshot.health;
  state.settings = snapshot.settings;
  state.protectionLevel = snapshot.protectionLevel;
}

export async function enterVault() {
  await loadData();
  showMain();
}

export async function reload() {
  await loadData();
  if (state.panel && !state.panel.isNew && !state.items.some((item) => item.id === state.panel.id)) closePanel(false);
  renderSidebar();
  renderContent();
}

export function setView(view, filter = { kind: 'all' }) {
  state.view = view;
  state.filter = filter;
  closePanel(false);
  renderSidebar();
  renderContent();
  state.dom.body.querySelector('.content')?.scrollTo(0, 0);
}

function addMenu() {
  const wrapper = h('div', { class: 'dropdown' });
  const option = (type, color, iconName, label, hint) => h('button', {
    type: 'button',
    onclick: () => {
      wrapper.querySelector('.menu')?.remove();
      if (type === 'identity') editIdentity();
      else newItem(type);
    },
  },
  h('span', { class: 'menu-icon', style: { background: color } }, icon(iconName, 17)),
  h('span', null, label, h('small', null, hint)));

  wrapper.append(h('button', {
    class: 'btn primary',
    type: 'button',
    onclick: () => {
      const open = wrapper.querySelector('.menu');
      if (open) {
        open.remove();
        return;
      }
      wrapper.append(h('div', { class: 'menu', role: 'menu' },
        option('login', PALETTE[0], 'key', 'Identifiant', 'Site web, application…'),
        option('note', NOTE_COLOR, 'note', 'Note sécurisée', 'Code Wi-Fi, codes de secours…'),
        option('identity', IDENTITY_COLOR, 'users', 'Identité', 'E-mail, pseudo, téléphone…')));
    },
  }, icon('plus', 18), 'Ajouter', icon('chevronDown', 16)));
  return wrapper;
}

export function showMain() {
  const sidebar = h('aside', { class: 'sidebar' });
  const body = h('div', { class: 'body' });
  const search = h('input', {
    type: 'search',
    placeholder: 'Rechercher un site, un identifiant, une note…',
    value: state.search,
    'aria-label': 'Rechercher',
    spellcheck: 'false',
    oninput: (event) => {
      state.search = event.target.value;
      if (!isListView()) {
        state.view = 'logins';
        renderSidebar();
      }
      renderContent();
    },
    onkeydown: (event) => {
      if (event.key !== 'Escape') return;
      event.target.value = '';
      state.search = '';
      renderContent();
    },
  });

  state.dom = { sidebar, body, search };
  document.getElementById('app').replaceChildren(h('div', { class: 'shell' },
    sidebar,
    h('main', { class: 'main' },
      h('header', { class: 'topbar' }, h('div', { class: 'search' }, icon('search', 18), search), h('div', { class: 'grow' }), addMenu()),
      body)));
  renderSidebar();
  renderContent();
}

export function renderSidebar() {
  const logins = state.items.filter((item) => item.type === 'login');
  const notes = state.items.filter((item) => item.type === 'note');
  const pool = state.view === 'notes' ? notes : logins;
  const inList = isListView();

  const navItem = (view, iconName, label, extra) => h('button', {
    class: `nav-item${state.view === view && (state.filter.kind === 'all' || !inList) ? ' active' : ''}`,
    type: 'button',
    onclick: () => setView(view),
  }, icon(iconName, 19), h('span', { class: 'nav-label' }, label), extra);

  const filterItem = (filter, marker, label, count) => {
    const active = inList && state.filter.kind === filter.kind && state.filter.value === filter.value;
    return h('button', {
      class: `nav-item${active ? ' active' : ''}`,
      type: 'button',
      onclick: () => setView(inList ? state.view : 'logins', active ? { kind: 'all' } : filter),
    }, marker, h('span', { class: 'nav-label' }, label), h('span', { class: 'count' }, String(count)));
  };

  const score = state.health?.score;
  const healthPill = score === null || score === undefined
    ? null
    : h('span', { class: `pill${score < 50 ? ' bad' : score < 80 ? ' mid' : ''}` }, String(score));

  const categories = [...new Set(pool.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));

  state.dom.sidebar.replaceChildren();
  append(state.dom.sidebar, [
    h('div', { class: 'brand' }, logo(36), 'Coffre-Fort'),
    navItem('logins', 'key', 'Identifiants', h('span', { class: 'count' }, String(logins.length))),
    navItem('notes', 'note', 'Notes sécurisées', h('span', { class: 'count' }, String(notes.length))),
    navItem('identities', 'users', 'Identités', h('span', { class: 'count' }, String(state.identities.length))),
    navItem('health', 'shieldCheck', 'Santé des mots de passe', healthPill),
    navItem('generator', 'zap', 'Générateur'),
    h('div', { class: 'nav-section' }, state.view === 'notes' ? 'Filtrer les notes' : 'Filtrer les identifiants'),
    filterItem({ kind: 'favorites' }, icon('star', 19), 'Favoris', pool.filter((item) => item.favorite).length),
    categories.map((name) => filterItem(
      { kind: 'category', value: name },
      h('span', { class: 'dot', style: { background: colorFor(name) } }),
      name,
      pool.filter((item) => item.category === name).length,
    )),
    h('div', { class: 'spacer' }),
    navItem('settings', 'settings', 'Paramètres'),
    h('button', { class: 'nav-item', type: 'button', onclick: () => api.vault.lock() },
      icon('lock', 19), h('span', { class: 'nav-label' }, 'Verrouiller'), h('span', { class: 'count' }, 'Ctrl+L')),
  ]);
}

export function renderContent() {
  if (!state.dom) return;
  const content = h('section', { class: 'content' });
  PAGES[state.view](content);
  const scroll = state.dom.body.querySelector('.content')?.scrollTop ?? 0;
  state.dom.body.replaceChildren(content, ...(state.panel && state.panelElement ? [state.panelElement] : []));
  content.scrollTop = scroll;
}
