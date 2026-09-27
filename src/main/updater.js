'use strict';

const { EventEmitter } = require('node:events');
const { app, Notification } = require('electron');
const { UserError } = require('./errors');
const config = require('./config');

class Updater extends EventEmitter {
  #engine = null;
  #firstCheck = null;
  #interval = null;
  #state = { state: 'idle' };

  get status() {
    return { ...this.#state, currentVersion: app.getVersion(), supported: this.#engine !== null };
  }

  start(automatic) {
    if (!app.isPackaged) return;
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;
    autoUpdater.on('checking-for-update', () => this.#set({ state: 'checking' }));
    autoUpdater.on('update-not-available', () => this.#set({ state: 'up-to-date', checkedAt: Date.now() }));
    autoUpdater.on('update-available', (info) => this.#set({ state: 'downloading', version: info.version, percent: 0 }));
    autoUpdater.on('download-progress', (progress) => this.#set({ ...this.#state, state: 'downloading', percent: Math.round(progress.percent) }));
    autoUpdater.on('update-downloaded', (info) => {
      this.#set({ state: 'ready', version: info.version });
      this.#notifyReady(info.version);
    });
    autoUpdater.on('error', () => this.#set({ state: 'error', message: 'Impossible de vérifier les mises à jour pour le moment.' }));
    this.#engine = autoUpdater;
    this.setAutomatic(automatic);
  }

  setAutomatic(enabled) {
    clearTimeout(this.#firstCheck);
    clearInterval(this.#interval);
    if (!this.#engine || !enabled) return;
    this.#firstCheck = setTimeout(() => this.#safeCheck(), config.updateFirstCheckMs);
    this.#interval = setInterval(() => this.#safeCheck(), config.updateCheckIntervalMs);
  }

  async check() {
    if (!this.#engine) throw new UserError("Les mises à jour ne sont disponibles que dans la version installée de l'application.");
    if (['checking', 'downloading', 'ready'].includes(this.#state.state)) return this.status;
    await this.#engine.checkForUpdates();
    return this.status;
  }

  install() {
    if (!this.#engine || this.#state.state !== 'ready') throw new UserError("Aucune mise à jour n'est prête à être installée.");
    setImmediate(() => this.#engine.quitAndInstall(false, true));
  }

  #safeCheck() {
    this.check().catch(() => {});
  }

  #set(state) {
    this.#state = state;
    this.emit('status', this.status);
  }

  #notifyReady(version) {
    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: 'Coffre-Fort — mise à jour prête',
      body: `La version ${version} sera installée à la fermeture de l'application.`,
    });
    notification.on('click', () => this.emit('focus-requested'));
    notification.show();
  }
}

module.exports = { Updater };
