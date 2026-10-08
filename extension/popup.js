import { fillLoginForm } from './fill.js';

const HOST_NAME = 'fr.coffrefort.app';
const STORAGE_KEY = 'pairingKey';
const POLL_MS = 1500;
const PALETTE = ['#0e7c6d', '#2563c9', '#7c3aed', '#c0266d', '#c2410c', '#15803d', '#0369a1', '#9333ea', '#a16207', '#475569'];

const view = document.getElementById('view');
const site = document.getElementById('site');

let port = null;
let nextId = 1;
let pollTimer = null;
let pairingKey = null;
let activeTab = null;
let currentView = null;
const pending = new Map();

function h(tag, props, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
    else element.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

function failure(message, code) {
  return Object.assign(new Error(message), { code });
}

function disconnect() {
  port?.disconnect();
  port = null;
}

function connect() {
  port = chrome.runtime.connectNative(HOST_NAME);
  port.onMessage.addListener((message) => {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.ok) request.resolve(message.value);
    else request.reject(failure(message.error, message.code));
  });
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message ?? '';
    const code = /host not found|forbidden/i.test(reason) ? 'host-missing' : 'disconnected';
    port = null;
    for (const request of pending.values()) request.reject(failure('Connexion à Coffre-Fort interrompue.', code));
    pending.clear();
  });
}

function request(type, payload = {}) {
  if (!port) connect();
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try {
      port.postMessage({ id, type, key: pairingKey, ...payload });
    } catch {
      pending.delete(id);
      reject(failure('Connexion à Coffre-Fort impossible.', 'disconnected'));
    }
  });
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function pollUntilReady() {
  stopPolling();
  pollTimer = setInterval(refresh, POLL_MS);
}

function render(name, ...children) {
  currentView = name;
  view.replaceChildren(...children.flat().filter(Boolean));
}

function state(title, text, ...extra) {
  return h('div', { class: 'state' }, h('h1', null, title), h('p', null, text), ...extra);
}

function hostOf(url) {
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

function browserName() {
  const brands = navigator.userAgentData?.brands?.map((brand) => brand.brand) ?? [];
  if (brands.includes('Microsoft Edge')) return 'Edge';
  if (brands.includes('Brave')) return 'Brave';
  if (brands.includes('Google Chrome')) return 'Chrome';
  return 'Navigateur';
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function pairingCode(key) {
  const digits = String(parseInt((await sha256Hex(key)).slice(0, 8), 16) % 1_000_000).padStart(6, '0');
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

function newKey() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function tile(title) {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  const element = h('span', { class: 'tile' }, (title.trim()[0] ?? '?').toUpperCase());
  element.style.background = PALETTE[hash % PALETTE.length];
  return element;
}

function renderSetup() {
  stopPolling();
  render('setup', state('Extension non activée',
    "Coffre-Fort n'est pas relié à ce navigateur.",
    h('ol', null,
      h('li', null, 'Ouvrez l’application Coffre-Fort.'),
      h('li', null, 'Paramètres › Navigateur : activez « Extension de navigateur ».'),
      h('li', null, 'Redémarrez le navigateur, puis rouvrez cette fenêtre.'))));
}

function renderNotRunning() {
  if (currentView === 'not-running') return;
  const button = h('button', {
    class: 'btn primary',
    type: 'button',
    onclick: async () => {
      button.disabled = true;
      await request('launch').catch(() => {});
      disconnect();
    },
  }, 'Ouvrir Coffre-Fort');
  render('not-running', state("Coffre-Fort n'est pas ouvert", "Lancez l'application pour remplir vos identifiants.", h('div', { class: 'actions' }, button)));
  pollUntilReady();
}

function renderLocked() {
  if (currentView === 'locked') return;
  render('locked', state('Coffre verrouillé', 'Déverrouillez Coffre-Fort avec votre mot de passe maître.',
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => request('focus').catch(() => {}) }, 'Déverrouiller'))));
  pollUntilReady();
}

function renderPairing(message) {
  stopPolling();
  const button = h('button', {
    class: 'btn primary',
    type: 'button',
    onclick: async () => {
      const key = newKey();
      const code = await pairingCode(key);
      render('pairing-code', state('Confirmez dans Coffre-Fort',
        "Vérifiez que ce code est identique à celui affiché par l'application, puis cliquez sur Autoriser.",
        h('div', { class: 'code' }, code)));
      try {
        pairingKey = key;
        await request('pair', { browser: browserName() });
        await chrome.storage.local.set({ [STORAGE_KEY]: key });
        refresh();
      } catch (error) {
        pairingKey = null;
        if (error.code === 'locked') renderLocked();
        else renderPairing(error.message);
      }
    },
  }, 'Associer ce navigateur');
  render('pairing',
    state('Associer ce navigateur', "Une seule fois : autorisez cette extension depuis l'application Coffre-Fort."),
    message ? h('div', { class: 'notice error' }, message) : null,
    h('div', { class: 'actions' }, button));
}

function item(entry, label, onPick) {
  return h('button', { class: 'item', type: 'button', onclick: () => onPick(entry) },
    tile(entry.title),
    h('span', { class: 'item-main' },
      h('span', { class: 'item-title' }, entry.title),
      h('div', { class: 'item-sub' }, label)),
    h('span', { class: 'item-action' }, 'Remplir'));
}

async function fill(entry, allowMismatch = false) {
  const notice = document.getElementById('notice');
  try {
    const credentials = await request('fill', { entryId: entry.id, url: activeTab.url, allowMismatch });
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: fillLoginForm,
      args: [credentials.username, credentials.password],
    });
    if (injection?.result?.filled) window.close();
    else notice.replaceChildren(h('div', { class: 'notice' }, 'Aucun champ de connexion trouvé sur cette page.'));
  } catch (error) {
    if (error.code === 'mismatch') renderMismatch(entry, error.message);
    else if (error.code === 'locked') renderLocked();
    else notice.replaceChildren(h('div', { class: 'notice error' }, error.message));
  }
}

function renderMismatch(entry, message) {
  render('mismatch',
    h('div', { class: 'notice' }, message, ' Ne continuez que si vous êtes certain d’être sur le bon site.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: renderLogins }, 'Annuler'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => { await renderLogins(); fill(entry, true); } }, 'Remplir quand même')));
}

async function renderLogins() {
  stopPolling();
  const host = hostOf(activeTab?.url ?? '');
  site.textContent = host;
  if (!host) {
    render('no-site', state('Aucun site à remplir', "Ouvrez la page de connexion d'un site web, puis cliquez à nouveau sur l'extension."));
    return;
  }

  const { items, secure } = await request('list', { url: activeTab.url });
  const results = h('div', { id: 'results' });
  let sequence = 0;
  const search = h('input', {
    class: 'search', type: 'search', placeholder: 'Chercher un autre compte…', 'aria-label': 'Chercher un autre compte',
    oninput: async (event) => {
      const current = ++sequence;
      const query = event.target.value.trim();
      if (!query) {
        results.replaceChildren();
        return;
      }
      const found = await request('search', { query }).catch(() => ({ items: [] }));
      if (current !== sequence) return;
      const others = found.items.filter((entry) => !items.some((match) => match.id === entry.id));
      results.replaceChildren(others.length
        ? h('div', { class: 'list' }, others.map((entry) => item(entry, `${entry.username || '—'} · ${entry.host || 'sans site'}`, (picked) => fill(picked))))
        : h('div', { class: 'empty' }, 'Aucun autre compte trouvé.'));
    },
  });

  render('logins',
    secure ? null : h('div', { class: 'notice error' }, "Cette page n'est pas sécurisée (http)."),
    h('div', { id: 'notice' }),
    items.length
      ? [h('div', { class: 'section' }, `Comptes pour ${host}`), h('div', { class: 'list' }, items.map((entry) => item(entry, entry.username || '—', (picked) => fill(picked))))]
      : h('div', { class: 'empty' }, `Aucun identifiant enregistré pour ${host}.`),
    search,
    results);
  (view.querySelector('.item') ?? search).focus();
}

async function refresh() {
  try {
    const status = await request('status');
    if (status.locked) renderLocked();
    else if (!status.paired) renderPairing();
    else await renderLogins();
  } catch (error) {
    if (error.code === 'host-missing') renderSetup();
    else if (error.code === 'app-not-running') {
      disconnect();
      renderNotRunning();
    } else if (error.code === 'unpaired') renderPairing();
    else if (error.code !== 'disconnected' || !pollTimer) render('error', h('div', { class: 'notice error' }, error.message));
  }
}

async function start() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pairingKey = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] ?? null;
  await refresh();
}

start();
