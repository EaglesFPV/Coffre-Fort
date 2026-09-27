'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULTS = Object.freeze({ autoUpdate: true });

class Preferences {
  #file = path.join(app.getPath('userData'), 'preferences.json');
  #values = this.#load();

  get values() {
    return { ...this.#values };
  }

  update(changes) {
    const next = { ...this.#values };
    if (typeof changes.autoUpdate === 'boolean') next.autoUpdate = changes.autoUpdate;
    fs.mkdirSync(path.dirname(this.#file), { recursive: true });
    fs.writeFileSync(this.#file, JSON.stringify(next, null, 2));
    this.#values = next;
    return this.values;
  }

  #load() {
    try {
      const stored = JSON.parse(fs.readFileSync(this.#file, 'utf8'));
      return { autoUpdate: typeof stored.autoUpdate === 'boolean' ? stored.autoUpdate : DEFAULTS.autoUpdate };
    } catch {
      return { ...DEFAULTS };
    }
  }
}

module.exports = { Preferences };
