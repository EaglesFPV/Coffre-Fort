import { api } from '../api.js';
import { h, iconButton } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { initials } from '../lib/format.js';
import { IDENTITY_FIELDS, state } from '../state.js';
import { emptyState, pageHead, setBusy } from '../ui/components.js';
import { attempt, toast } from '../ui/feedback.js';
import { closeModal, confirmModal, openModal } from '../ui/modal.js';
import { reload } from './shell.js';

export const IDENTITY_COLOR = '#0369a1';

export const defaultIdentity = () => state.identities.find((identity) => identity.isDefault) ?? null;

export function identityLoginValues(identity) {
  return {
    username: identity?.username || identity?.email || '',
    email: identity?.email ?? '',
    phone: identity?.phone ?? '',
  };
}

export function usernameSuggestions() {
  const values = state.identities.flatMap((identity) => [identity.email, identity.username]).filter(Boolean);
  return [...new Set(values)];
}

const byName = (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, 'fr');

async function save(id, fields) {
  await api.identities.save(id, fields);
  await reload();
}

export function editIdentity(existing = null) {
  const name = h('input', { class: 'input', value: existing?.name ?? '', placeholder: 'Ex. : Personnel, Travail, Jeux…', maxlength: '60' });
  const inputs = Object.fromEntries(IDENTITY_FIELDS.map((definition) => {
    const control = definition.multiline
      ? h('textarea', { class: 'input', rows: '3', placeholder: definition.placeholder, spellcheck: 'false' })
      : h('input', { class: 'input', placeholder: definition.placeholder, spellcheck: 'false', autocomplete: 'off' });
    control.value = existing?.[definition.key] ?? '';
    return [definition.key, control];
  }));
  const isDefault = h('input', { type: 'checkbox', class: 'switch', checked: existing ? existing.isDefault : state.identities.length === 0 });
  const feedback = h('div', { class: 'message error' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer');

  openModal(h('form', {
    class: 'modal wide',
    role: 'dialog',
    'aria-modal': 'true',
    onsubmit: async (event) => {
      event.preventDefault();
      feedback.textContent = '';
      setBusy(submit, true, 'Enregistrement…');
      const fields = { name: name.value, isDefault: isDefault.checked };
      for (const [key, control] of Object.entries(inputs)) fields[key] = control.value;
      try {
        await save(existing?.id ?? null, fields);
        closeModal();
        toast(existing ? 'Profil modifié' : 'Profil ajouté');
      } catch (error) {
        setBusy(submit, false);
        feedback.textContent = error.message;
      }
    },
  },
  h('h2', null, existing ? 'Modifier le profil' : "Nouveau profil d'identité"),
  h('p', null, "Remplissez seulement ce qui vous est utile. Le profil remplit d'un coup l'identifiant, l'e-mail et le téléphone de vos comptes."),
  h('div', { class: 'stack' },
    h('div', null, h('label', { class: 'label' }, 'Nom du profil'), name),
    h('div', { class: 'form-grid' }, IDENTITY_FIELDS.map((definition) => h('div', { class: definition.multiline ? 'span-2' : null },
      h('label', { class: 'label' }, definition.label), inputs[definition.key]))),
    h('label', { class: 'toggle' }, h('span', null, 'Profil par défaut pour les nouveaux identifiants'), isDefault)),
  feedback,
  h('div', { class: 'actions' },
    h('button', { class: 'btn', type: 'button', onclick: closeModal }, 'Annuler'),
    submit)));
  name.focus();
}

async function removeIdentity(identity) {
  const confirmed = await confirmModal({
    title: `Supprimer le profil « ${identity.name} » ?`,
    text: 'Le profil sera retiré du coffre. Les identifiants déjà remplis ne sont pas modifiés.',
    confirmLabel: 'Supprimer',
    danger: true,
  });
  if (!confirmed) return;
  await attempt(async () => {
    await api.identities.remove(identity.id);
    await reload();
    toast('Profil supprimé', { iconName: 'trash' });
  });
}

async function copyField(identity, definition) {
  const result = await attempt(() => api.identities.copy(identity.id, definition.key));
  if (result) toast(`${definition.label} copié`, { iconName: 'copy', countdown: result.seconds });
}

function card(identity) {
  const avatar = h('div', { class: 'tile' }, initials(identity.name));
  avatar.style.background = IDENTITY_COLOR;
  const lines = IDENTITY_FIELDS.filter((definition) => identity[definition.key]).map((definition) => h('div', { class: 'identity-line' },
    h('span', { class: 'identity-icon' }, icon(definition.icon, 16)),
    h('div', { class: 'identity-text' },
      h('div', { class: 'identity-label' }, definition.label),
      h('div', { class: `identity-value selectable${definition.multiline ? ' multiline' : ''}` }, identity[definition.key])),
    iconButton('copy', `Copier : ${definition.label}`, () => copyField(identity, definition))));

  return h('article', { class: `identity-card${identity.isDefault ? ' default' : ''}` },
    h('header', { class: 'identity-head' },
      avatar,
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, identity.name),
        identity.isDefault ? h('span', { class: 'chip accent' }, 'Par défaut') : h('div', { class: 'row-sub' }, 'Profil')),
      iconButton('star', identity.isDefault ? 'Profil par défaut' : 'Définir par défaut',
        () => attempt(() => save(identity.id, { ...identity, isDefault: !identity.isDefault })),
        { className: identity.isDefault ? 'favorite' : '', filled: identity.isDefault }),
      iconButton('edit', 'Modifier', () => editIdentity(identity)),
      iconButton('trash', 'Supprimer', () => removeIdentity(identity))),
    h('div', { class: 'identity-lines' }, lines));
}

export function renderIdentities(content) {
  const identities = [...state.identities].sort(byName);
  content.append(pageHead('Identités', `${identities.length} profil${identities.length > 1 ? 's' : ''}`));
  if (!identities.length) {
    content.append(emptyState('users', 'Créez votre premier profil',
      "Regroupez votre nom, vos e-mails, pseudo, téléphone et adresse dans un profil (Personnel, Travail…). Il remplit vos nouveaux identifiants en un clic.",
      h('button', { class: 'btn primary', type: 'button', onclick: () => editIdentity() }, icon('plus'), 'Nouveau profil')));
    return;
  }
  content.append(h('div', { class: 'identity-grid' }, identities.map(card),
    h('button', { class: 'identity-add', type: 'button', onclick: () => editIdentity() }, icon('plus', 22), 'Nouveau profil')));
}
