'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const { FrameDecoder, encodeFrame } = require('../core/frames');
const { hostOf, matches, isSecurePage } = require('../core/url-match');

const SEARCH_LIMIT = 20;
const KEY_PATTERN = /^[0-9a-f]{64}$/;

class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function pairingCode(key) {
  const digest = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
  const digits = String(parseInt(digest.slice(0, 8), 16) % 1_000_000).padStart(6, '0');
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

function summarize(entry) {
  return { id: entry.id, title: entry.title, username: entry.username || entry.email, host: hostOf(entry.url) };
}

function text(value, max) {
  return typeof value === 'string' && value.length <= max ? value : '';
}

class BrowserBridge {
  #options;
  #server = null;
  #sockets = new Set();
  #pairingInProgress = false;

  constructor(options) {
    this.#options = options;
  }

  get isRunning() {
    return this.#server !== null;
  }

  start() {
    if (this.#server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.#accept(socket));
      server.once('error', reject);
      server.listen(this.#options.pipePath, () => {
        server.removeListener('error', reject);
        server.on('error', () => {});
        this.#server = server;
        resolve();
      });
    });
  }

  stop() {
    for (const socket of this.#sockets) socket.destroy();
    this.#sockets.clear();
    this.#server?.close();
    this.#server = null;
  }

  #accept(socket) {
    const decoder = new FrameDecoder();
    let greeted = false;
    let queue = Promise.resolve();
    this.#sockets.add(socket);
    socket.on('close', () => this.#sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk) => {
      let messages;
      try {
        messages = decoder.push(chunk);
      } catch {
        socket.destroy();
        return;
      }
      for (const message of messages) {
        if (!greeted) {
          if (message.type !== 'hello' || !this.#options.allowedOrigins.includes(message.origin)) {
            socket.destroy();
            return;
          }
          greeted = true;
          continue;
        }
        queue = queue.then(async () => {
          const reply = await this.#dispatch(message);
          const id = Number.isSafeInteger(message.id) ? message.id : 0;
          if (!socket.destroyed) socket.write(encodeFrame({ id, ...reply }));
        });
      }
    });
  }

  async #dispatch(message) {
    const handlers = {
      status: () => this.#status(message),
      focus: () => this.#focus(),
      launch: () => this.#focus(),
      pair: () => this.#pair(message),
      list: () => this.#list(message),
      search: () => this.#search(message),
      fill: () => this.#fill(message),
    };
    try {
      const handler = Object.hasOwn(handlers, message.type) ? handlers[message.type] : null;
      if (!handler) throw new BridgeError('unknown', 'Requête inconnue.');
      return { ok: true, value: await handler() };
    } catch (error) {
      if (error instanceof BridgeError) return { ok: false, code: error.code, error: error.message };
      return { ok: false, code: 'error', error: 'Erreur interne de Coffre-Fort.' };
    }
  }

  #pairedVault(message) {
    const vault = this.#options.getVault();
    if (!vault) throw new BridgeError('locked', 'Le coffre est verrouillé.');
    if (!vault.isBrowserPaired(message.key)) throw new BridgeError('unpaired', "Ce navigateur n'est pas associé à Coffre-Fort.");
    return vault;
  }

  #status(message) {
    const vault = this.#options.getVault();
    return {
      version: this.#options.version,
      locked: !vault,
      paired: vault ? vault.isBrowserPaired(message.key) : false,
    };
  }

  #focus() {
    this.#options.showWindow();
    return {};
  }

  async #pair(message) {
    const key = text(message.key, 64);
    if (!KEY_PATTERN.test(key)) throw new BridgeError('invalid', "Clé d'association invalide.");
    const vault = this.#options.getVault();
    if (!vault) throw new BridgeError('locked', 'Déverrouillez Coffre-Fort pour associer ce navigateur.');
    if (vault.isBrowserPaired(key)) return { paired: true };
    if (this.#pairingInProgress) throw new BridgeError('busy', 'Une association est déjà en attente dans Coffre-Fort.');

    const browser = text(message.browser, 40).replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || 'Navigateur';
    this.#pairingInProgress = true;
    try {
      this.#options.showWindow();
      const approved = await this.#options.confirmPairing({ code: pairingCode(key), browser });
      if (!approved) throw new BridgeError('refused', "L'association a été refusée dans Coffre-Fort.");
      const current = this.#options.getVault();
      if (!current) throw new BridgeError('locked', 'Le coffre a été verrouillé avant la fin de l’association.');
      current.pairBrowser(browser, key);
      return { paired: true };
    } finally {
      this.#pairingInProgress = false;
    }
  }

  #list(message) {
    const vault = this.#pairedVault(message);
    const url = text(message.url, 4096);
    const items = vault.entries
      .filter((entry) => entry.type === 'login' && matches(entry.url, url))
      .map(summarize)
      .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    return { host: hostOf(url), secure: isSecurePage(url), items };
  }

  #search(message) {
    const vault = this.#pairedVault(message);
    const query = text(message.query, 200).trim().toLocaleLowerCase('fr');
    if (!query) return { items: [] };
    const items = vault.entries
      .filter((entry) => entry.type === 'login')
      .filter((entry) => [entry.title, entry.username, entry.email, entry.url].some((value) => value.toLocaleLowerCase('fr').includes(query)))
      .map(summarize)
      .sort((a, b) => a.title.localeCompare(b.title, 'fr'))
      .slice(0, SEARCH_LIMIT);
    return { items };
  }

  #fill(message) {
    const vault = this.#pairedVault(message);
    const url = text(message.url, 4096);
    const entry = vault.get(text(message.entryId, 100));
    if (!entry || entry.type !== 'login') throw new BridgeError('not-found', 'Identifiant introuvable.');

    if (!matches(entry.url, url)) {
      if (!isSecurePage(url)) throw new BridgeError('insecure', "Cette page n'est pas sécurisée (http) : remplissage refusé.");
      if (message.allowMismatch !== true) {
        throw new BridgeError('mismatch', `Cet identifiant est enregistré pour ${hostOf(entry.url) || 'un autre site'}, pas pour ${hostOf(url)}.`);
      }
    }
    if (this.#options.needsMasterPassword()) {
      this.#options.requestMasterPassword();
      throw new BridgeError('master-required', 'Confirmez votre mot de passe maître dans Coffre-Fort, puis réessayez.');
    }
    this.#options.touch();
    return { username: entry.username || entry.email, password: entry.password };
  }
}

module.exports = { BrowserBridge, pairingCode };
