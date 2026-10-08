'use strict';

const fs = require('node:fs');
const { BrowserBridge } = require('./browser-bridge');
const registration = require('./browser-registration');
const { UserError } = require('./errors');
const config = require('./config');

class BrowserIntegration {
  #bridge;

  constructor({ vaultSession, version, showWindow, confirmPairing, requestMasterPassword }) {
    this.#bridge = new BrowserBridge({
      pipePath: config.browser.pipePath,
      allowedOrigins: [`chrome-extension://${config.browser.extensionId}/`],
      version,
      getVault: () => (vaultSession.isUnlocked ? vaultSession.vault : null),
      needsMasterPassword: () => vaultSession.needsMasterPassword,
      touch: () => vaultSession.touch(),
      showWindow,
      confirmPairing,
      requestMasterPassword,
    });
  }

  get state() {
    return {
      enabled: this.#bridge.isRunning,
      available: process.platform === 'win32' && fs.existsSync(config.browser.hostPath),
      extensionDir: config.browser.extensionDir,
    };
  }

  async setEnabled(enabled) {
    if (enabled === this.#bridge.isRunning) return;
    if (!enabled) {
      this.#bridge.stop();
      if (config.browser.manageRegistration) await registration.unregister(this.#registration());
      return;
    }
    if (!this.state.available) throw new UserError("Le module de liaison avec le navigateur est introuvable. Réinstallez Coffre-Fort.");
    if (config.browser.manageRegistration) await registration.register(this.#registration());
    try {
      await this.#bridge.start();
    } catch {
      throw new UserError('Impossible de démarrer la liaison avec le navigateur.');
    }
  }

  dispose() {
    this.#bridge.stop();
  }

  #registration() {
    return {
      hostName: config.browser.hostName,
      hostPath: config.browser.hostPath,
      manifestPath: config.browser.manifestPath,
      extensionId: config.browser.extensionId,
    };
  }
}

module.exports = { BrowserIntegration };
