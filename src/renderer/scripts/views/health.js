import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { byTitle, domainOf, formatDate, plural } from '../lib/format.js';
import { state } from '../state.js';
import { emptyState, pageHead, tile } from '../ui/components.js';
import { openItem } from './panel.js';
import { renderContent } from './shell.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const TABS = Object.freeze([
  { key: 'reused', icon: 'repeat', label: 'Réutilisés' },
  { key: 'weak', icon: 'alert', label: 'Faibles' },
  { key: 'old', icon: 'clock', label: "Anciens (plus d'un an)" },
]);

const verdict = (score) => (score >= 90 ? 'Excellent' : score >= 70 ? 'Bon' : score >= 50 ? 'À améliorer' : 'Faible');
const scoreColor = (score) => (score >= 80 ? 'var(--ok)' : score >= 50 ? 'var(--fair)' : 'var(--danger)');

function ring(score) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 140 140');
  svg.setAttribute('width', '140');
  svg.setAttribute('height', '140');
  const arc = (color, length) => {
    const circle = document.createElementNS(SVG_NS, 'circle');
    const attributes = { cx: 70, cy: 70, r: radius, fill: 'none', 'stroke-width': 12, 'stroke-linecap': 'round' };
    for (const [key, value] of Object.entries(attributes)) circle.setAttribute(key, value);
    if (length !== undefined) circle.setAttribute('stroke-dasharray', `${length} ${circumference}`);
    circle.style.stroke = color;
    return circle;
  };
  svg.append(arc('var(--surface-2)'), arc(scoreColor(score), Math.max(0.001, (score / 100) * circumference)));
  return h('div', { class: 'ring' }, svg,
    h('div', { class: 'value' }, h('div', null, h('strong', null, String(score)), h('span', null, 'sur 100'))));
}

function reason(item) {
  if (state.healthTab === 'reused') return `Utilisé sur ${item.health.reuseCount} comptes`;
  if (state.healthTab === 'weak') return `Solidité : ${item.health.strengthLabel.toLowerCase()}`;
  return `Changé le ${formatDate(item.passwordModified)}`;
}

export function renderHealth(content) {
  const summary = state.health;
  content.append(pageHead('Santé des mots de passe'));
  if (!summary?.total) {
    content.append(emptyState('shieldCheck', 'Rien à analyser pour le moment',
      'Ajoutez des identifiants : leur solidité et leur réutilisation seront analysées ici, directement sur cet ordinateur.'));
    return;
  }

  content.append(h('div', { class: 'health-hero' }, ring(summary.score), h('div', null,
    h('h2', null, `Score de sécurité : ${verdict(summary.score)}`),
    h('p', null, `${plural(summary.safe, 'mot de passe est sûr', 'mots de passe sont sûrs')} sur ${summary.total}. Le score compte les mots de passe ni faibles ni réutilisés. L'analyse se fait uniquement sur cet ordinateur.`))));

  content.append(h('div', { class: 'stats' }, TABS.map((tab) => h('button', {
    class: `stat${state.healthTab === tab.key ? ' active' : ''}`,
    type: 'button',
    onclick: () => {
      state.healthTab = tab.key;
      renderContent();
    },
  }, h('div', { class: 'number' }, String(summary[tab.key])), h('div', { class: 'caption' }, icon(tab.icon, 16), tab.label)))));

  const affected = state.items
    .filter((item) => item.health?.[state.healthTab])
    .sort((a, b) => (state.healthTab === 'weak' ? a.health.strength - b.health.strength : 0) || byTitle(a, b));
  if (!affected.length) {
    content.append(emptyState('check', 'Aucun problème ici', 'Bravo, rien à corriger dans cette catégorie.'));
    return;
  }

  content.append(h('div', { class: 'list' }, affected.map((item) => h('div', {
    class: `row${state.panel?.id === item.id ? ' selected' : ''}`,
    onclick: () => openItem(item.id),
  },
  tile(item),
  h('div', { class: 'row-main' },
    h('div', { class: 'row-title' }, item.title),
    h('div', { class: 'row-sub' }, `${item.username || domainOf(item.url) || '—'} · ${reason(item)}`)),
  h('button', {
    class: 'btn',
    type: 'button',
    onclick: (event) => {
      event.stopPropagation();
      openItem(item.id, 'edit');
    },
  }, 'Changer')))));
}
