import { api } from '../api.js';
import { h, iconButton } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { byTitle, domainOf, groupLetter, normalizeQuery, plural } from '../lib/format.js';
import { state } from '../state.js';
import { emptyState, pageHead, tile } from '../ui/components.js';
import { attempt, toast } from '../ui/feedback.js';
import { newItem, openItem, renderPanel } from './panel.js';
import { reload } from './shell.js';

const COPY_LABELS = Object.freeze({ username: 'Identifiant copié', password: 'Mot de passe copié', notes: 'Contenu copié' });

export async function copyField(item, field) {
  const result = await attempt(() => api.items.copy(item.id, field));
  if (result) toast(COPY_LABELS[field], { iconName: 'copy', countdown: result.seconds });
}

export async function toggleFavorite(item) {
  await attempt(async () => {
    await api.items.setFavorite(item.id, !item.favorite);
    await reload();
    if (state.panel?.id === item.id && state.panel.mode === 'view') await renderPanel();
  });
}

function visibleItems() {
  const type = state.view === 'notes' ? 'note' : 'login';
  const query = normalizeQuery(state.search);
  const { filter } = state;
  return state.items
    .filter((item) => item.type === type)
    .filter((item) => filter.kind === 'all' || (filter.kind === 'favorites' ? item.favorite : item.category === filter.value))
    .filter((item) => !query || [item.title, item.username, item.url, item.category].some((value) => normalizeQuery(value).includes(query)))
    .sort(byTitle);
}

function pageTitle() {
  if (state.filter.kind === 'favorites') return 'Favoris';
  if (state.filter.kind === 'category') return state.filter.value;
  return state.view === 'notes' ? 'Notes sécurisées' : 'Identifiants';
}

function emptyView() {
  if (state.search) return emptyState('search', 'Aucun résultat', `Rien ne correspond à « ${state.search} ».`);
  if (state.filter.kind === 'favorites') return emptyState('star', 'Aucun favori', "Cliquez sur l'étoile d'un élément pour l'épingler ici.");
  if (state.filter.kind === 'category') return emptyState('tag', 'Catégorie vide', 'Aucun élément dans cette catégorie.');
  if (state.view === 'notes') {
    return emptyState('note', 'Aucune note sécurisée', 'Rangez ici vos codes Wi-Fi, codes de secours, numéros de licence… Tout est chiffré.',
      h('button', { class: 'btn primary', type: 'button', onclick: () => newItem('note') }, icon('plus'), 'Nouvelle note'));
  }
  return emptyState('key', 'Ajoutez votre premier identifiant', 'Enregistrez vos comptes : le coffre les chiffre et vous aide à les rendre plus sûrs.',
    h('button', { class: 'btn primary', type: 'button', onclick: () => newItem('login') }, icon('plus'), 'Nouvel identifiant'));
}

function row(item) {
  const isLogin = item.type === 'login';
  const subtitle = isLogin ? item.username || domainOf(item.url) || '—' : item.category || 'Note sécurisée';
  const health = item.health;
  const warning = isLogin && health && (health.weak || health.reused)
    ? h('span', { class: 'warning', title: health.reused ? 'Mot de passe réutilisé' : 'Mot de passe faible' }, icon('alert', 17))
    : null;
  const actions = isLogin
    ? [
      iconButton('user', "Copier l'identifiant", () => copyField(item, 'username'), { disabled: !item.username }),
      iconButton('copy', 'Copier le mot de passe', () => copyField(item, 'password'), { disabled: !item.hasPassword }),
      iconButton('external', 'Ouvrir le site', () => attempt(() => api.items.openUrl(item.id)), { disabled: !item.url }),
    ]
    : [iconButton('copy', 'Copier le contenu', () => copyField(item, 'notes'), { disabled: !item.hasNotes })];

  return h('div', {
    class: `row${state.panel?.id === item.id ? ' selected' : ''}`,
    tabindex: '0',
    role: 'button',
    onclick: () => openItem(item.id),
    onkeydown: (event) => {
      if (event.key === 'Enter' && event.target === event.currentTarget) openItem(item.id);
    },
  },
  tile(item),
  h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, item.title), h('div', { class: 'row-sub' }, subtitle)),
  warning,
  item.category ? h('span', { class: 'chip' }, item.category) : null,
  h('div', { class: 'row-actions' }, actions),
  iconButton('star', item.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', () => toggleFavorite(item),
    { className: item.favorite ? 'favorite' : '', filled: item.favorite }));
}

export function renderItems(content) {
  const items = visibleItems();
  content.append(pageHead(pageTitle(), plural(items.length, 'élément', 'éléments')));
  if (!items.length) {
    content.append(emptyView());
    return;
  }

  const list = h('div', { class: 'list' });
  const favorites = state.filter.kind === 'all' && !state.search ? items.filter((item) => item.favorite) : [];
  if (favorites.length) {
    list.append(h('div', { class: 'list-group' }, '★ FAVORIS'));
    favorites.forEach((item) => list.append(row(item)));
  }
  let letter = null;
  for (const item of items) {
    if (favorites.includes(item)) continue;
    const current = groupLetter(item.title);
    if (current !== letter) {
      letter = current;
      list.append(h('div', { class: 'list-group' }, current));
    }
    list.append(row(item));
  }
  content.append(list);
}
