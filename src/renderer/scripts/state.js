export const CATEGORIES = Object.freeze([
  'Personnel', 'Travail', 'Banque & finance', 'Réseaux sociaux',
  'Achats', 'Divertissement', 'Administration', 'Santé',
]);

export const LOCK_MESSAGES = Object.freeze({
  idle: "Coffre verrouillé après une période d'inactivité.",
  screen: 'Coffre verrouillé en même temps que votre session Windows.',
  suspend: "Coffre verrouillé lors de la mise en veille de l'ordinateur.",
});

export const state = {
  view: 'logins',
  filter: { kind: 'all' },
  search: '',
  items: [],
  health: null,
  settings: {},
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
    health: null,
    settings: {},
    panel: null,
    panelElement: null,
    search: '',
    dom: null,
  });
}
