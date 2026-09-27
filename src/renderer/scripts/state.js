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

export const IDENTITY_FIELDS = Object.freeze([
  { key: 'fullName', label: 'Nom complet', icon: 'idCard', placeholder: 'Prénom Nom' },
  { key: 'email', label: 'E-mail', icon: 'mail', placeholder: 'prenom.nom@exemple.fr' },
  { key: 'username', label: 'Pseudo', icon: 'at', placeholder: 'mon_pseudo' },
  { key: 'phone', label: 'Téléphone', icon: 'phone', placeholder: '06 12 34 56 78' },
  { key: 'address', label: 'Adresse postale', icon: 'mapPin', placeholder: '12 rue de la Paix\n75002 Paris', multiline: true },
]);

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
