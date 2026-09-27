import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';

const toastElement = () => document.getElementById('toast');
let toastTimer = null;

function paint(element, iconName, text) {
  element.replaceChildren(icon(iconName, 18), h('span', null, text));
}

export function hideToast() {
  clearInterval(toastTimer);
  clearTimeout(toastTimer);
  toastElement().classList.remove('show');
}

export function toast(message, { iconName = 'check', countdown = 0, error = false } = {}) {
  const element = toastElement();
  clearInterval(toastTimer);
  clearTimeout(toastTimer);
  element.classList.toggle('error', error);
  if (countdown > 0) {
    let remaining = countdown;
    const text = () => `${message} · effacé du presse-papiers dans ${remaining} s`;
    paint(element, iconName, text());
    toastTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) clearInterval(toastTimer);
      else paint(element, iconName, text());
    }, 1000);
  } else {
    paint(element, iconName, message);
    toastTimer = setTimeout(() => element.classList.remove('show'), error ? 4000 : 2600);
  }
  element.classList.add('show');
}

export function toastError(error) {
  toast(error?.message ?? String(error), { iconName: 'alert', error: true });
}

export async function attempt(task) {
  try {
    return await task();
  } catch (error) {
    toastError(error);
    return undefined;
  }
}
