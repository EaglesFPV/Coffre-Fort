'use strict';

const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { powerMonitor } = require('electron');
const { Vault } = require('../core/vault');
const { estimate } = require('../core/passwords');
const { UserError } = require('./errors');
const config = require('./config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assertStrongMasterPassword(password) {
  if (typeof password !== 'string' || password.length > 1024) throw new UserError('Mot de passe invalide.');
  if ([...password].length < config.minMasterPasswordLength) {
    throw new UserError(`Le mot de passe maître doit contenir au moins ${config.minMasterPasswordLength} caractères.`);
  }
  if (estimate(password).score < config.minMasterPasswordScore) {
    throw new UserError('Ce mot de passe maître est trop facile à deviner. Allongez-le ou utilisez une phrase de plusieurs mots.');
  }
}

class VaultSession extends EventEmitter {
  #vault = null;
  #busy = false;
  #failedAttempts = 0;
  #lastActivity = Date.now();
  #timer = null;

  get exists() {
    return fs.existsSync(config.vaultPath);
  }

  get isUnlocked() {
    return this.#vault !== null;
  }

  get vault() {
    this.assertUnlocked();
    return this.#vault;
  }

  assertUnlocked() {
    if (!this.#vault) throw new UserError('Le coffre est verrouillé.');
  }

  touch() {
    this.#lastActivity = Date.now();
  }

  create(password) {
    return this.#exclusive(async () => {
      assertStrongMasterPassword(password);
      this.#vault = await Vault.create(config.vaultPath, password);
      this.touch();
    });
  }

  unlock(password) {
    return this.#exclusive(async () => {
      if (typeof password !== 'string' || password.length > 1024) throw new UserError('Mot de passe invalide.');
      if (this.#failedAttempts >= 3) await sleep(Math.min(2 ** (this.#failedAttempts - 3), 30) * 1000);
      try {
        this.#vault = await Vault.open(config.vaultPath, password);
      } catch (error) {
        this.#failedAttempts++;
        throw error;
      }
      this.#failedAttempts = 0;
      this.touch();
    });
  }

  changeMasterPassword(current, next) {
    return this.#exclusive(async () => {
      const vault = this.vault;
      if (typeof current !== 'string') throw new UserError('Mot de passe invalide.');
      assertStrongMasterPassword(next);
      if (current === next) throw new UserError("Le nouveau mot de passe doit être différent de l'actuel.");
      if (!(await vault.checkPassword(current))) throw new UserError('Mot de passe actuel incorrect.');
      await vault.changePassword(next);
    });
  }

  lock(reason) {
    if (!this.#vault || this.#busy) return false;
    this.#vault.lock();
    this.#vault = null;
    this.emit('locked', reason);
    return true;
  }

  startAutoLock() {
    this.#timer = setInterval(() => {
      if (!this.#vault || this.#busy) return;
      const idleMs = Date.now() - this.#lastActivity;
      if (idleMs > this.#vault.settings.autoLockMinutes * 60_000) this.lock('idle');
    }, config.autoLockPollMs);
    powerMonitor.on('lock-screen', () => this.lock('screen'));
    powerMonitor.on('suspend', () => this.lock('suspend'));
  }

  dispose() {
    clearInterval(this.#timer);
    if (this.#vault) this.#vault.lock();
    this.#vault = null;
  }

  async #exclusive(task) {
    if (this.#busy) throw new UserError('Une opération est déjà en cours.');
    this.#busy = true;
    try {
      return await task();
    } finally {
      this.#busy = false;
    }
  }
}

module.exports = { VaultSession };
