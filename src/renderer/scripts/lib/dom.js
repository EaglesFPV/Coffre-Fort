import { icon } from './icons.js';

export function append(parent, children) {
  for (const child of [children].flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function h(tag, props, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key === 'style') Object.assign(element.style, value);
    else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') element.value = value;
    else if (key === 'checked') element.checked = true;
    else element.setAttribute(key, value === true ? '' : value);
  }
  return append(element, children);
}

export function iconButton(name, label, onClick, { disabled = false, className = '', filled = false, size = 18 } = {}) {
  return h('button', {
    type: 'button',
    class: `icon-btn ${className}`.trim(),
    title: label,
    'aria-label': label,
    disabled,
    onclick: (event) => {
      event.stopPropagation();
      onClick(event);
    },
  }, icon(name, size, filled));
}
