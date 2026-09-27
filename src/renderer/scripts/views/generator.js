import { api } from '../api.js';
import { h, iconButton } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { state } from '../state.js';
import { colorize, pageHead, strengthMeter } from '../ui/components.js';
import { attempt, toast } from '../ui/feedback.js';
import { renderContent } from './shell.js';

const CHARSET_OPTIONS = Object.freeze([
  ['lower', 'Minuscules (a-z)'],
  ['upper', 'Majuscules (A-Z)'],
  ['digits', 'Chiffres (0-9)'],
  ['symbols', 'Symboles (! # $ % …)'],
  ['avoidAmbiguous', 'Éviter les caractères similaires (l, I, 1, O, 0)'],
]);

export function renderGenerator(content) {
  const options = state.generator;
  const output = h('div', { class: 'password', 'aria-live': 'polite' });
  const meter = strengthMeter();
  const entropy = h('span', { class: 'message' });
  const lengthLabel = h('span', { class: 'length' }, String(options.length));
  let current = '';

  const regenerate = async () => {
    const result = await attempt(() => api.passwords.generate(options));
    if (!result) return;
    current = result.password;
    output.replaceChildren(colorize(current));
    meter.set(result);
    entropy.textContent = `Environ ${Math.round(result.bits)} bits d'entropie`;
  };

  const copy = async () => {
    const result = await attempt(() => api.passwords.copy(current));
    if (result) toast('Mot de passe copié', { iconName: 'copy', countdown: result.seconds });
  };

  const slider = h('input', {
    type: 'range', min: '8', max: '64', value: String(options.length), 'aria-label': 'Longueur',
    oninput: (event) => {
      options.length = Number(event.target.value);
      lengthLabel.textContent = String(options.length);
      regenerate();
    },
  });

  const toggles = CHARSET_OPTIONS.map(([key, label]) => h('label', { class: 'toggle' }, h('span', null, label), h('input', {
    type: 'checkbox',
    class: 'switch',
    checked: options[key],
    onchange: (event) => {
      options[key] = event.target.checked;
      if (!['lower', 'upper', 'digits', 'symbols'].some((name) => options[name])) {
        options.lower = true;
        renderContent();
        return;
      }
      regenerate();
    },
  })));

  content.append(pageHead('Générateur de mots de passe'), h('div', { class: 'generator' },
    h('div', { class: 'generator-output' }, output,
      iconButton('refresh', 'Générer un autre mot de passe', regenerate, { size: 20 }),
      h('button', { class: 'btn primary', type: 'button', onclick: copy }, icon('copy', 16), 'Copier')),
    h('div', { class: 'generator-strength' }, meter, entropy),
    h('div', { class: 'generator-controls' },
      h('div', null, h('label', { class: 'label' }, 'Longueur'), h('div', { class: 'slider-row' }, slider, lengthLabel)),
      h('div', { class: 'toggle-grid' }, toggles))));

  regenerate();
}
