'use strict';

const { app, globalShortcut, Menu, nativeImage, Tray } = require('electron');
const { UserError } = require('./errors');
const config = require('./config');

class SystemIntegration {
  #getWindow;
  #showWindow;
  #vaultSession;
  #tray = null;
  #shortcut = null;
  #values = null;
  #quitting = false;

  constructor({ getWindow, showWindow, vaultSession }) {
    this.#getWindow = getWindow;
    this.#showWindow = showWindow;
    this.#vaultSession = vaultSession;
    app.on('before-quit', () => {
      this.#quitting = true;
    });
    vaultSession.on('locked', () => this.refreshTray());
    vaultSession.on('unlocked', () => this.refreshTray());
  }

  get keepsRunningInTray() {
    return Boolean(this.#values?.showTray);
  }

  apply(values) {
    const previous = this.#values;
    try {
      this.#applyShortcut(values.globalShortcut);
      this.#applyLoginItem(values.launchAtStartup);
    } catch (error) {
      if (previous) this.#applyShortcut(previous.globalShortcut);
      throw error;
    }
    this.#applyTray(values.showTray);
    this.#values = { ...values };
  }

  attach(window) {
    window.on('close', (event) => {
      if (this.#quitting || !this.#values?.closeToTray || !this.#tray) return;
      event.preventDefault();
      window.hide();
      this.#lockIfRequested();
    });
    window.on('minimize', () => this.#lockIfRequested());
  }

  refreshTray() {
    if (!this.#tray) return;
    const unlocked = this.#vaultSession.isUnlocked;
    this.#tray.setToolTip(unlocked ? 'Coffre-Fort — déverrouillé' : 'Coffre-Fort — verrouillé');
    this.#tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ouvrir Coffre-Fort', click: () => this.#showWindow() },
      { label: 'Verrouiller', enabled: unlocked, click: () => this.#vaultSession.lock('manual') },
      { type: 'separator' },
      { label: 'Quitter', click: () => app.quit() },
    ]));
  }

  dispose() {
    globalShortcut.unregisterAll();
    this.#tray?.destroy();
    this.#tray = null;
  }

  #lockIfRequested() {
    if (this.#vaultSession.isUnlocked && this.#vaultSession.vault.settings.lockOnMinimize) {
      this.#vaultSession.lock('minimize');
    }
  }

  #applyTray(enabled) {
    if (enabled && !this.#tray) {
      const image = nativeImage.createFromPath(config.iconPath).resize({ width: 32, height: 32, quality: 'best' });
      this.#tray = new Tray(image);
      this.#tray.on('click', () => this.#showWindow());
      this.refreshTray();
    } else if (!enabled && this.#tray) {
      this.#tray.destroy();
      this.#tray = null;
    }
  }

  #applyShortcut(key) {
    const accelerator = config.globalShortcuts[key] ?? null;
    if (accelerator === this.#shortcut) return;
    if (this.#shortcut) globalShortcut.unregister(this.#shortcut);
    this.#shortcut = null;
    if (!accelerator) return;
    if (!globalShortcut.register(accelerator, () => this.#showWindow())) {
      throw new UserError('Ce raccourci est déjà utilisé par une autre application.');
    }
    this.#shortcut = accelerator;
  }

  #applyLoginItem(enabled) {
    if (!app.isPackaged) {
      if (enabled) throw new UserError("Le lancement au démarrage n'est disponible que dans la version installée.");
      return;
    }
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: ['--hidden'] });
  }
}

module.exports = { SystemIntegration };
