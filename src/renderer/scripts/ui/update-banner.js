import { api } from '../api.js';
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { state } from '../state.js';
import { attempt } from './feedback.js';

export function describeUpdate(status) {
  if (!status || !status.supported) return "Mises à jour automatiques disponibles dans la version installée.";
  switch (status.state) {
    case 'checking': return 'Recherche de mises à jour…';
    case 'downloading': return `Téléchargement de la version ${status.version} (${status.percent ?? 0} %)…`;
    case 'ready': return `La version ${status.version} est prête. Elle s'installera à la fermeture de l'application.`;
    case 'up-to-date': return 'Vous utilisez la dernière version.';
    case 'error': return status.message;
    default: return 'Les mises à jour sont vérifiées automatiquement.';
  }
}

export function renderUpdateBanner() {
  const container = document.getElementById('update-banner');
  const status = state.update;
  if (!status || status.state !== 'ready') {
    container.replaceChildren();
    return;
  }
  container.replaceChildren(h('div', { class: 'update-banner' },
    icon('download', 18),
    h('span', { class: 'grow' }, h('strong', null, `Coffre-Fort ${status.version} est prête.`), ' Redémarrez pour en profiter, ou elle sera installée à la prochaine fermeture.'),
    h('button', { class: 'btn primary small', type: 'button', onclick: () => attempt(() => api.app.installUpdate()) }, 'Redémarrer maintenant')));
}
