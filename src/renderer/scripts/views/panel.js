import { api } from '../api.js';
import { h, iconButton } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { domainOf, formatDate } from '../lib/format.js';
import { CATEGORIES, state } from '../state.js';
import { bindStrength, colorize, field, passwordInput, strengthMeter, tile } from '../ui/components.js';
import { attempt, toast } from '../ui/feedback.js';
import { confirmModal } from '../ui/modal.js';
import { copyField, toggleFavorite } from './items.js';
import { isListView, loadData, reload, renderContent, renderSidebar } from './shell.js';

const MASK = '••••••••••••';

export function closePanel(render = true) {
  state.panel = null;
  state.panelElement = null;
  if (render) renderContent();
}

export function newItem(type) {
  const matchingView = type === 'note' ? 'notes' : 'logins';
  if ((isListView() && state.view !== matchingView) || (!isListView() && state.view !== 'health')) {
    state.view = matchingView;
    state.filter = { kind: 'all' };
    renderSidebar();
  }
  state.panel = { id: null, type, mode: 'edit', isNew: true };
  renderPanel();
}

export async function openItem(id, mode = 'view') {
  const item = state.items.find((candidate) => candidate.id === id);
  if (!item) return;
  state.panel = { id, type: item.type, mode, isNew: false };
  await renderPanel();
}

export async function renderPanel() {
  const panel = state.panel;
  if (!panel) return;
  const item = panel.isNew ? null : state.items.find((candidate) => candidate.id === panel.id);
  const element = panel.mode === 'edit' ? await editView(item, panel.type) : await detailView(item);
  if (state.panel !== panel) return;
  state.panelElement = element;
  renderContent();
  if (panel.mode === 'edit') element.querySelector('input')?.focus();
}

function passwordField(item) {
  const value = h('div', { class: `field-value mono masked${item.hasPassword ? '' : ' placeholder'}` }, item.hasPassword ? MASK : 'Aucun');
  let revealed = false;
  const toggle = iconButton('eye', 'Afficher le mot de passe', async () => {
    if (!revealed) {
      const password = await attempt(() => api.items.reveal(item.id, 'password'));
      if (password === undefined) return;
      value.className = 'field-value mono selectable';
      value.replaceChildren(colorize(password));
    } else {
      value.className = 'field-value mono masked';
      value.replaceChildren(MASK);
    }
    revealed = !revealed;
    toggle.replaceChildren(icon(revealed ? 'eyeOff' : 'eye'));
  }, { disabled: !item.hasPassword });

  const element = field('Mot de passe', value, toggle,
    iconButton('copy', 'Copier le mot de passe', () => copyField(item, 'password'), { disabled: !item.hasPassword }));
  if (item.health) {
    const meter = strengthMeter();
    meter.set({ score: item.health.strength, label: item.health.strengthLabel });
    element.querySelector('.field-body').append(meter);
  }
  return element;
}

function healthFlags(health) {
  if (!health) return [];
  const flags = [];
  if (health.reused) flags.push(h('div', { class: 'flag bad' }, icon('repeat', 16), `Ce mot de passe est utilisé sur ${health.reuseCount} comptes. Donnez-lui un mot de passe unique.`));
  else if (health.weak) flags.push(h('div', { class: 'flag' }, icon('alert', 16), 'Mot de passe facile à deviner. Remplacez-le par un mot de passe généré.'));
  if (health.old) flags.push(h('div', { class: 'flag' }, icon('clock', 16), "Ce mot de passe n'a pas été changé depuis plus d'un an."));
  return flags;
}

async function detailView(item) {
  const isLogin = item.type === 'login';
  const notes = item.hasNotes ? await api.items.reveal(item.id, 'notes').catch(() => '') : '';
  const domain = domainOf(item.url);

  const head = h('div', { class: 'panel-head' },
    iconButton('x', 'Fermer', () => closePanel()),
    h('span', { class: 'title' }),
    iconButton('star', item.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', () => toggleFavorite(item),
      { className: item.favorite ? 'favorite' : '', filled: item.favorite }),
    h('button', { class: 'btn', type: 'button', onclick: () => openItem(item.id, 'edit') }, icon('edit', 16), 'Modifier'));

  const hero = h('div', { class: 'hero' }, tile(item, true), h('h2', { class: 'selectable' }, item.title),
    isLogin && domain
      ? h('button', { class: 'link', type: 'button', onclick: () => attempt(() => api.items.openUrl(item.id)) }, domain, icon('external', 14))
      : !isLogin ? h('span', { class: 'chip' }, 'Note sécurisée') : null);

  const fields = h('div', { class: 'fields' });
  if (isLogin) {
    fields.append(field('Identifiant',
      h('div', { class: `field-value selectable${item.username ? '' : ' placeholder'}` }, item.username || 'Non renseigné'),
      iconButton('copy', "Copier l'identifiant", () => copyField(item, 'username'), { disabled: !item.username })));
    fields.append(passwordField(item), ...healthFlags(item.health));
    if (item.url) {
      fields.append(field('Site web', h('div', { class: 'field-value selectable' }, item.url),
        iconButton('external', 'Ouvrir le site', () => attempt(() => api.items.openUrl(item.id)))));
    }
  }
  if (notes || !isLogin) {
    fields.append(field(isLogin ? 'Notes' : 'Contenu',
      h('div', { class: `field-value multiline selectable${notes ? '' : ' placeholder'}` }, notes || 'Vide'),
      iconButton('copy', 'Copier', () => copyField(item, 'notes'), { disabled: !notes })));
  }
  if (item.category) fields.append(field('Catégorie', h('div', { class: 'field-value' }, item.category)));

  return h('aside', { class: 'panel', 'aria-label': 'Détails' }, head, hero, fields,
    h('div', { class: 'meta' }, `Créé le ${formatDate(item.created)} · modifié le ${formatDate(item.modified)}`));
}

function categoryInput(value) {
  const known = [...new Set([...CATEGORIES, ...state.items.map((item) => item.category).filter(Boolean)])]
    .sort((a, b) => a.localeCompare(b, 'fr'));
  return [
    h('input', { class: 'input', list: 'category-options', value, placeholder: 'Aucune (choisissez ou tapez un nom)', maxlength: '100' }),
    h('datalist', { id: 'category-options' }, known.map((name) => h('option', { value: name }))),
  ];
}

async function editView(item, type) {
  const isLogin = type === 'login';
  const [password, notes] = item
    ? await Promise.all([
      isLogin && item.hasPassword ? api.items.reveal(item.id, 'password') : '',
      item.hasNotes ? api.items.reveal(item.id, 'notes') : '',
    ])
    : ['', ''];

  const title = h('input', { class: 'input', value: item?.title ?? '', placeholder: isLogin ? 'Ex. : Messagerie, Banque…' : 'Ex. : Code Wi-Fi', maxlength: '500' });
  const username = h('input', { class: 'input', value: item?.username ?? '', placeholder: "Adresse e-mail ou nom d'utilisateur", spellcheck: 'false' });
  const secret = h('input', { class: 'input mono', type: 'password', value: password, spellcheck: 'false', autocomplete: 'off' });
  const url = h('input', { class: 'input', value: item?.url ?? '', placeholder: 'exemple.fr', spellcheck: 'false' });
  const [category, categoryOptions] = categoryInput(item?.category ?? '');
  const content = h('textarea', { class: `input${isLogin ? '' : ' tall'}`, placeholder: isLogin ? 'Questions secrètes, codes de secours…' : 'Contenu de la note (chiffré)' });
  content.value = notes;
  const favorite = h('input', { type: 'checkbox', class: 'switch', checked: item?.favorite });
  const feedback = h('div', { class: 'message error' });
  const meter = strengthMeter();
  const refreshStrength = isLogin ? bindStrength(secret, meter) : null;

  const generate = iconButton('refresh', 'Générer un mot de passe sûr', async () => {
    const result = await attempt(() => api.passwords.generate({ ...state.generator, length: Math.max(state.generator.length, 16) }));
    if (!result) return;
    secret.value = result.password;
    secret.type = 'text';
    refreshStrength();
  });

  const save = async () => {
    feedback.textContent = '';
    if (!title.value.trim()) {
      feedback.textContent = 'Donnez un nom à cet élément.';
      title.focus();
      return;
    }
    try {
      const id = await api.items.save({
        id: item?.id,
        type,
        title: title.value,
        category: category.value,
        notes: content.value,
        favorite: favorite.checked,
        ...(isLogin ? { username: username.value, password: secret.value, url: url.value } : {}),
      });
      secret.value = '';
      state.panel = { id, type, mode: 'view', isNew: false };
      await loadData();
      renderSidebar();
      await renderPanel();
      toast(item ? 'Modifications enregistrées' : 'Élément ajouté au coffre');
    } catch (error) {
      feedback.textContent = error.message;
    }
  };

  const remove = async () => {
    const confirmed = await confirmModal({
      title: `Supprimer « ${item.title} » ?`,
      text: 'Cet élément sera définitivement supprimé du coffre.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!confirmed) return;
    await attempt(async () => {
      await api.items.remove(item.id);
      closePanel(false);
      await reload();
      toast('Élément supprimé', { iconName: 'trash' });
    });
  };

  const cancel = () => (item ? openItem(item.id) : closePanel());
  const labelled = (text, ...controls) => h('div', null, h('label', { class: 'label' }, text), ...controls);

  const form = h('form', {
    class: 'form',
    onsubmit: (event) => {
      event.preventDefault();
      save();
    },
    onkeydown: (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        cancel();
      }
      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
      }
    },
  },
  labelled('Nom', title),
  isLogin ? [
    labelled('Identifiant', username),
    labelled('Mot de passe', passwordInput(secret, generate), meter),
    labelled('Site web', url),
  ] : null,
  labelled('Catégorie', category, categoryOptions),
  labelled(isLogin ? 'Notes' : 'Contenu', content),
  h('label', { class: 'toggle' }, h('span', null, 'Épingler dans les favoris'), favorite),
  feedback,
  h('div', { class: 'form-actions' },
    item ? h('button', { class: 'btn danger', type: 'button', onclick: remove }, icon('trash', 16), 'Supprimer') : null,
    h('div', { class: 'grow' }),
    h('button', { class: 'btn', type: 'button', onclick: cancel }, 'Annuler'),
    h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer')));

  const head = h('div', { class: 'panel-head' },
    iconButton('x', 'Fermer', () => closePanel()),
    h('span', { class: 'title' }, item ? 'Modifier' : isLogin ? 'Nouvel identifiant' : 'Nouvelle note sécurisée'));

  return h('aside', { class: 'panel', 'aria-label': 'Modification' }, head, form);
}
