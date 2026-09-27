import { api } from '../api.js';
import { h, iconButton } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { NOTE_COLOR, colorFor, domainOf, initials } from '../lib/format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LOGO_PATHS = Object.freeze([
  ['logo-shield', 'M256 64C204 96 152 110 96 114V250C96 346 164 418 256 452C348 418 416 346 416 250V114C360 110 308 96 256 64Z'],
  ['logo-lock', 'M230 267A52 52 0 1 1 282 267L298 342H214Z'],
]);

export function logo(size = 56) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attributes = {
    class: 'logo', viewBox: '0 0 512 512', width: size, height: size, fill: 'none',
    'stroke-width': 30, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  for (const [className, d] of LOGO_PATHS) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', className);
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function tile(item, large = false) {
  const element = h('div', { class: `tile${large ? ' large' : ''}` });
  if (item.type === 'note') {
    element.append(icon('note', large ? 30 : 19));
    element.style.background = NOTE_COLOR;
  } else {
    element.append(initials(item.title));
    element.style.background = colorFor(domainOf(item.url) || item.title.toLowerCase());
  }
  return element;
}

export function colorize(password) {
  const fragment = document.createDocumentFragment();
  for (const char of password) {
    const className = /[0-9]/.test(char) ? 'c-digit' : /[A-Za-z]/.test(char) ? null : 'c-symbol';
    fragment.append(className ? h('span', { class: className }, char) : char);
  }
  return fragment;
}

export function passwordInput(input, ...adornments) {
  const toggle = iconButton('eye', 'Afficher', () => {
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    toggle.replaceChildren(icon(reveal ? 'eyeOff' : 'eye'));
    toggle.title = reveal ? 'Masquer' : 'Afficher';
    input.focus();
  });
  return h('div', { class: 'input-wrap' }, input, h('div', { class: 'adornments' }, ...adornments, toggle));
}

export function strengthMeter() {
  const bars = [h('span'), h('span'), h('span'), h('span')];
  const label = h('span', { class: 'strength-label' });
  const element = h('div', { class: 'strength' }, h('div', { class: 'strength-bar' }, bars), label);
  element.set = (strength) => {
    element.dataset.score = strength ? strength.score : '';
    label.textContent = strength ? strength.label : '';
    bars.forEach((bar, index) => bar.classList.toggle('on', Boolean(strength) && index < Math.max(1, strength.score)));
  };
  return element;
}

export function bindStrength(input, meter) {
  let timer = null;
  let sequence = 0;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const current = ++sequence;
      if (!input.value) {
        meter.set(null);
        return;
      }
      const strength = await api.passwords.estimate(input.value).catch(() => null);
      if (current === sequence) meter.set(strength);
    }, 90);
  };
  input.addEventListener('input', refresh);
  refresh();
  return refresh;
}

export function setBusy(button, busy, label) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.disabled = true;
    button.replaceChildren(h('span', { class: 'spinner' }), label);
  } else {
    button.disabled = false;
    button.replaceChildren(button.dataset.label ?? '');
  }
}

export function field(label, value, ...actions) {
  return h('div', { class: 'field' },
    h('div', { class: 'field-body' }, h('div', { class: 'field-label' }, label), value),
    ...actions);
}

export function pageHead(title, subtitle) {
  return h('div', { class: 'page-head' }, h('h1', null, title), subtitle ? h('span', { class: 'sub' }, subtitle) : null);
}

export function emptyState(iconName, title, text, action) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon(iconName, 32)),
    h('h2', null, title),
    h('p', null, text),
    action);
}
