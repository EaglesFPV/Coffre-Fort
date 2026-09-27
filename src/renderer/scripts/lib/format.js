export const PALETTE = Object.freeze([
  '#0e7c6d', '#2563c9', '#7c3aed', '#c0266d', '#c2410c', '#15803d',
  '#0369a1', '#9333ea', '#a16207', '#475569', '#0f766e', '#be123c',
]);

export const NOTE_COLOR = '#d97706';

export function colorFor(key) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function domainOf(url) {
  if (!url) return '';
  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(candidate).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function initials(title) {
  const words = title.trim().split(/[\s._-]+/).filter(Boolean);
  if (!words.length) return '?';
  const first = (word) => [...word][0].toLocaleUpperCase('fr');
  return words.length === 1 ? first(words[0]) : first(words[0]) + first(words[1]);
}

export function groupLetter(title) {
  const letter = title.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toLocaleUpperCase('fr');
  return /[A-Z]/.test(letter) ? letter : '#';
}

export const formatDate = (seconds) =>
  new Date(seconds * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export const plural = (count, singular, pluralForm) => `${count} ${count > 1 ? pluralForm : singular}`;

export const byTitle = (a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });

export const normalizeQuery = (text) => text.trim().toLocaleLowerCase('fr');
