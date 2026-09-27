import { api } from '../api.js';
import { h, iconButton } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { IDENTITY_KINDS, state } from '../state.js';
import { emptyState, pageHead, setBusy } from '../ui/components.js';
import { attempt, toast } from '../ui/feedback.js';
import { closeModal, confirmModal, openModal } from '../ui/modal.js';
import { reload } from './shell.js';

export const IDENTITY_COLOR = '#0369a1';

const KIND_ORDER = Object.keys(IDENTITY_KINDS);

export function identitySuggestions() {
  return state.identities.filter((identity) => identity.kind === 'email' || identity.kind === 'username');
}

export function defaultIdentityValue() {
  return state.identities.find((identity) => identity.isDefault)?.value ?? '';
}

async function save(id, fields) {
  await api.identities.save(id, fields);
  await reload();
}

export function editIdentity(existing = null) {
  const kind = h('select', { class: 'input', 'aria-label': "Type d'identité" }, KIND_ORDER.map((key) => {
    const option = h('option', { value: key }, IDENTITY_KINDS[key].label);
    option.selected = key === (existing?.kind ?? 'email');
    return option;
  }));
  const value = h('input', { class: 'input', value: existing?.value ?? '', spellcheck: 'false', autocomplete: 'off' });
  const label = h('input', { class: 'input', value: existing?.label ?? '', placeholder: 'Ex. : Personnel, Travail, Jeux…', maxlength: '60' });
  const isDefault = h('input', { type: 'checkbox', class: 'switch', checked: existing?.isDefault });
  const feedback = h('div', { class: 'message error' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer');
  const syncPlaceholder = () => { value.placeholder = IDENTITY_KINDS[kind.value].placeholder; };
  kind.addEventListener('change', syncPlaceholder);
  syncPlaceholder();

  openModal(h('form', {
    class: 'modal',
    role: 'dialog',
    'aria-modal': 'true',
    onsubmit: async (event) => {
      event.preventDefault();
      feedback.textContent = '';
      setBusy(submit, true, 'Enregistrement…');
      try {
        await save(existing?.id ?? null, { kind: kind.value, value: value.value, label: label.value, isDefault: isDefault.checked });
        closeModal();
        toast(existing ? 'Identité modifiée' : 'Identité ajoutée');
      } catch (error) {
        setBusy(submit, false);
        feedback.textContent = error.message;
      }
    },
  },
  h('h2', null, existing ? "Modifier l'identité" : 'Nouvelle identité'),
  h('p', null, 'Vos e-mails et pseudos sont proposés automatiquement quand vous ajoutez un identifiant.'),
  h('div', { class: 'stack' },
    h('div', null, h('label', { class: 'label' }, 'Type'), kind),
    h('div', null, h('label', { class: 'label' }, 'Valeur'), value),
    h('div', null, h('label', { class: 'label' }, 'Libellé (facultatif)'), label),
    h('label', { class: 'toggle' }, h('span', null, 'Utiliser par défaut pour les nouveaux identifiants'), isDefault)),
  feedback,
  h('div', { class: 'actions' },
    h('button', { class: 'btn', type: 'button', onclick: closeModal }, 'Annuler'),
    submit)));
  value.focus();
}

async function removeIdentity(identity) {
  const confirmed = await confirmModal({
    title: `Supprimer « ${identity.value} » ?`,
    text: 'Cette identité sera retirée du coffre. Les identifiants existants ne sont pas modifiés.',
    confirmLabel: 'Supprimer',
    danger: true,
  });
  if (!confirmed) return;
  await attempt(async () => {
    await api.identities.remove(identity.id);
    await reload();
    toast('Identité supprimée', { iconName: 'trash' });
  });
}

async function copyIdentity(identity) {
  const result = await attempt(() => api.identities.copy(identity.id));
  if (result) toast(`${IDENTITY_KINDS[identity.kind].label} copié`, { iconName: 'copy', countdown: result.seconds });
}

function row(identity) {
  const kind = IDENTITY_KINDS[identity.kind];
  const tileElement = h('div', { class: 'tile' }, icon(kind.icon, 19));
  tileElement.style.background = IDENTITY_COLOR;
  return h('div', { class: 'row', tabindex: '0', role: 'button', onclick: () => editIdentity(identity) },
    tileElement,
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title selectable' }, identity.value),
      h('div', { class: 'row-sub' }, identity.label ? `${kind.label} · ${identity.label}` : kind.label)),
    identity.isDefault ? h('span', { class: 'chip accent' }, 'Par défaut') : null,
    h('div', { class: 'row-actions' },
      iconButton('copy', 'Copier', () => copyIdentity(identity)),
      iconButton('edit', 'Modifier', () => editIdentity(identity)),
      iconButton('trash', 'Supprimer', () => removeIdentity(identity))),
    iconButton('star', identity.isDefault ? 'Identité par défaut' : 'Définir par défaut',
      () => attempt(() => save(identity.id, { ...identity, isDefault: !identity.isDefault })),
      { className: identity.isDefault ? 'favorite' : '', filled: identity.isDefault }));
}

export function renderIdentities(content) {
  const identities = [...state.identities].sort((a, b) =>
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.value.localeCompare(b.value, 'fr'));
  content.append(pageHead('Identités', `${identities.length} enregistrée${identities.length > 1 ? 's' : ''}`));

  if (!identities.length) {
    content.append(emptyState('users', 'Enregistrez vos identités',
      "Vos adresses e-mail, pseudos et numéros sont proposés automatiquement quand vous créez un identifiant. L'identité par défaut est préremplie.",
      h('button', { class: 'btn primary', type: 'button', onclick: () => editIdentity() }, icon('plus'), 'Nouvelle identité')));
    return;
  }

  const list = h('div', { class: 'list' });
  let currentKind = null;
  for (const identity of identities) {
    if (identity.kind !== currentKind) {
      currentKind = identity.kind;
      list.append(h('div', { class: 'list-group' }, IDENTITY_KINDS[currentKind].label.toLocaleUpperCase('fr')));
    }
    list.append(row(identity));
  }
  content.append(list);
}
