'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { UserError } = require('./errors');
const config = require('./config');

const DEFAULTS = Object.freeze({
  autoUpdate: true,
  launchAtStartup: false,
  showTray: true,
  closeToTray: false,
  globalShortcut: 'none',
});

const BOOLEAN_KEYS = Object.freeze(['autoUpdate', 'launchAtStartup', 'showTray', 'closeToTray']);

function sanitize(source, fallback) {
  const values = { ...fallback };
  for (const key of BOOLEAN_KEYS) {
    if (typeof source[key] === 'boolean') values[key] = source[key];
  }
  if (Object.hasOwn(config.globalShortcuts, source.globalShortcut)) values.globalShortcut = source.globalShortcut;
  if (!values.showTray) values.closeToTray = false;
  return values;
}

class Preferences {
  #file = path.join(app.getPath('userData'), 'preferences.json');
  #values = this.#load();

  get values() {
    return { ...this.#values };
  }

  preview(changes) {
    if (!changes || typeof changes !== 'object') throw new UserError('Préférences invalides.');
    return sanitize(changes, this.#values);
  }

  save(values) {
    fs.mkdirSync(path.dirname(this.#file), { recursive: true });
    fs.writeFileSync(this.#file, JSON.stringify(values, null, 2));
    this.#values = { ...values };
    return this.values;
  }

  #load() {
    try {
      return sanitize(JSON.parse(fs.readFileSync(this.#file, 'utf8')), DEFAULTS);
    } catch {
      return { ...DEFAULTS };
    }
  }
}

module.exports = { Preferences };
