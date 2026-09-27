export const CATEGORIES = Object.freeze([
  'Personnel', 'Travail', 'Banque & finance', 'Réseaux sociaux',
  'Achats', 'Divertissement', 'Administration', 'Santé',
]);

export const LOCK_MESSAGES = Object.freeze({
  idle: "Coffre verrouillé après une période d'inactivité.",
  screen: 'Coffre verrouillé en même temps que votre session Windows.',
  suspend: "Coffre verrouillé lors de la mise en veille de l'ordinateur.",
  minimize: 'Coffre verrouillé à la réduction de la fenêtre.',
});

export const IDENTITY_KINDS = Object.freeze({
  email: { label: 'E-mail', icon: 'mail', placeholder: 'prenom.nom@exemple.fr' },
  username: { label: 'Pseudo', icon: 'at', placeholder: 'mon_pseudo' },
  phone: { label: 'Téléphone', icon: 'phone', placeholder: '06 12 34 56 78' },
  name: { label: 'Nom complet', icon: 'idCard', placeholder: 'Prénom Nom' },
  other: { label: 'Autre', icon: 'hash', placeholder: 'Valeur' },
});

export const state = {
  view: 'logins',
  filter: { kind: 'all' },
  search: '',
  items: [],
  identities: [],
  health: null,
  settings: {},
  protectionLevel: null,
  vaultPath: '',
  panel: null,
  panelElement: null,
  healthTab: 'reused',
  generator: { length: 20, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: false },
  dom: null,
  appInfo: null,
  update: null,
};

export function resetSession() {
  Object.assign(state, {
    items: [],
    identities: [],
    health: null,
    settings: {},
    protectionLevel: null,
    panel: null,
    panelElement: null,
    search: '',
    dom: null,
  });
}
