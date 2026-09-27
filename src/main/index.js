'use strict';

const { app, Menu } = require('electron');
const security = require('./security');
const config = require('./config');
const { createMainWindow } = require('./window');
const { VaultSession } = require('./vault-session');
const { SecretClipboard } = require('./secret-clipboard');
const { Preferences } = require('./preferences');
const { SystemIntegration } = require('./system');
const { Updater } = require('./updater');
const { registerIpc } = require('./ipc');

security.beforeReady();
Menu.setApplicationMenu(null);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow = null;

  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };
  const showWindow = () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };

  const vaultSession = new VaultSession();
  const secretClipboard = new SecretClipboard({
    getWindow: () => mainWindow,
    getClearDelay: () => (vaultSession.isUnlocked ? vaultSession.vault.settings.clipboardSeconds : config.defaultClipboardSeconds),
  });
  const system = new SystemIntegration({ getWindow: () => mainWindow, showWindow, vaultSession });
  const updater = new Updater();

  vaultSession.on('locked', (reason) => {
    secretClipboard.clear();
    send('vault:locked', reason);
  });
  secretClipboard.on('cleared', () => send('clipboard:cleared'));
  updater.on('status', (status) => send('update:status', status));
  updater.on('focus-requested', showWindow);

  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    security.afterReady();
    const preferences = new Preferences();
    try {
      system.apply(preferences.values);
    } catch {
      system.apply({ ...preferences.values, globalShortcut: 'none', launchAtStartup: false });
    }
    registerIpc({ vaultSession, secretClipboard, preferences, updater, system, getWindow: () => mainWindow });

    const hidden = config.startHidden && system.keepsRunningInTray;
    mainWindow = createMainWindow({ show: !hidden });
    system.attach(mainWindow);
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    vaultSession.startAutoLock();
    updater.start(preferences.values.autoUpdate);
  });

  app.on('window-all-closed', () => app.quit());

  app.on('will-quit', () => {
    secretClipboard.clear();
    system.dispose();
    vaultSession.dispose();
  });
}
