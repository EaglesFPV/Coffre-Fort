'use strict';

const crypto = require('node:crypto');

const CHARSETS = Object.freeze({
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&()*+,-./:;<=>?@[]^_{}~',
});
const AMBIGUOUS = new Set('Il1|O0o`\'"');
const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const DEFAULT_LENGTH = 20;

const COMMON_PASSWORDS = new Set([
  '123456', '123456789', '12345678', '12345', '1234567', '1234567890', '111111', '000000', '123123', '654321',
  '666666', '121212', '112233', 'password', 'passw0rd', 'motdepasse', 'azerty', 'azertyuiop', 'qwerty',
  'qwertyuiop', 'abc123', 'iloveyou', 'jetaime', 'soleil', 'doudou', 'chouchou', 'loulou', 'bonjour',
  'marseille', 'nicolas', 'camille', 'julien', 'portugal', 'princesse', 'coucou', 'tintin', 'chocolat',
  'dragon', 'monkey', 'football', 'baseball', 'master', 'shadow', 'sunshine', 'princess', 'welcome', 'admin',
  'letmein', 'trustno1', 'superman', 'batman', 'starwars', 'pokemon', 'charlie', 'freedom', 'whatever',
  'hello', 'secret', 'login', 'zaq12wsx', '1q2w3e4r',
]);
const KEYBOARD_ROWS = Object.freeze(['azertyuiop', 'qsdfghjklm', 'wxcvbn', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890']);

const RATINGS = Object.freeze([
  { below: 28, score: 0, label: 'Très faible' },
  { below: 40, score: 1, label: 'Faible' },
  { below: 60, score: 2, label: 'Moyen' },
  { below: 80, score: 3, label: 'Fort' },
  { below: Infinity, score: 4, label: 'Très fort' },
]);

function rating(bits) {
  const { score, label } = RATINGS.find((level) => bits < level.below);
  return { score, label };
}

function selectCharsets({ lower = true, upper = true, digits = true, symbols = true, avoidAmbiguous = false } = {}) {
  const enabled = { lower, upper, digits, symbols };
  const sets = Object.entries(CHARSETS)
    .filter(([name]) => enabled[name])
    .map(([, chars]) => (avoidAmbiguous ? [...chars].filter((c) => !AMBIGUOUS.has(c)).join('') : chars));
  return sets.length ? sets : [CHARSETS.lower];
}

function generate(options = {}) {
  const length = Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, Math.trunc(Number(options.length) || DEFAULT_LENGTH)));
  const sets = selectCharsets(options);
  const alphabet = sets.join('');
  for (;;) {
    let password = '';
    for (let i = 0; i < length; i++) password += alphabet[crypto.randomInt(alphabet.length)];
    if (sets.every((set) => [...password].some((c) => set.includes(c)))) {
      const bits = length * Math.log2(alphabet.length);
      return { password, bits, ...rating(bits) };
    }
  }
}

function characterPoolSize(password) {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[0-9]/.test(password)) size += 10;
  if (/[^A-Za-z0-9]/.test(password)) size += 33;
  if (/[^\x00-\x7f]/.test(password)) size += 60;
  return Math.max(size, 2);
}

function effectiveLength(password) {
  const lower = password.toLowerCase();
  const weights = new Array(password.length).fill(1);
  for (let i = 1; i < password.length; i++) {
    const step = lower.charCodeAt(i) - lower.charCodeAt(i - 1);
    const previousStep = i > 1 ? lower.charCodeAt(i - 1) - lower.charCodeAt(i - 2) : null;
    if (step === 0 || (Math.abs(step) === 1 && previousStep === step)) weights[i] = 0.2;
  }
  for (const row of KEYBOARD_ROWS) {
    for (let size = row.length; size >= 4; size--) {
      for (let start = 0; start + size <= row.length; start++) {
        const chunk = row.slice(start, start + size);
        for (let at = lower.indexOf(chunk); at !== -1; at = lower.indexOf(chunk, at + 1)) {
          for (let k = at + 1; k < at + size; k++) weights[k] = Math.min(weights[k], 0.2);
        }
      }
    }
  }
  return weights.reduce((sum, weight) => sum + weight, 0);
}

function estimate(input) {
  const password = String(input ?? '');
  if (!password) return { score: 0, label: 'Vide', bits: 0 };

  const lower = password.toLowerCase();
  const core = lower.replace(/[^a-z]+$/, '').replace(/^[^a-z]+/, '');
  if (COMMON_PASSWORDS.has(lower) || (core.length >= 4 && COMMON_PASSWORDS.has(core))) {
    return { score: 0, label: 'Très faible', bits: 10 };
  }

  let bits = effectiveLength(password) * Math.log2(characterPoolSize(password));
  const wordWithSuffix = /^([A-Za-zÀ-ÿ]{3,12})(\d{0,4})([^A-Za-z0-9]{0,2})$/.exec(password);
  if (wordWithSuffix) {
    bits = Math.min(bits, 22 + wordWithSuffix[2].length * 3.3 + wordWithSuffix[3].length * 5);
  }
  if (/(19|20)\d\d/.test(password)) bits -= 4;
  bits = Math.max(0, bits);
  return { bits, ...rating(bits) };
}

module.exports = { generate, estimate, rating };
