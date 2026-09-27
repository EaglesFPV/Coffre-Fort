'use strict';

const { app, Menu } = require('electron');
const security = require('./security');
const { createMainWindow } = require('./window');
const { VaultSession } = require('./vault-session');
const { SecretClipboard } = require('./secret-clipboard');
const { Preferences } = require('./preferences');
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
  const focus = () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };

  const vaultSession = new VaultSession();
  const secretClipboard = new SecretClipboard(() => mainWindow);
  const updater = new Updater();
  let preferences;

  vaultSession.on('locked', (reason) => {
    secretClipboard.clear();
    send('vault:locked', reason);
  });
  secretClipboard.on('cleared', () => send('clipboard:cleared'));
  updater.on('status', (status) => send('update:status', status));
  updater.on('focus-requested', focus);

  app.on('second-instance', focus);

  app.whenReady().then(() => {
    security.afterReady();
    preferences = new Preferences();
    registerIpc({ vaultSession, secretClipboard, preferences, updater, getWindow: () => mainWindow });
    mainWindow = createMainWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    vaultSession.startAutoLock();
    updater.start(preferences.values.autoUpdate);
  });

  app.on('window-all-closed', () => app.quit());

  app.on('will-quit', () => {
    secretClipboard.clear();
    vaultSession.dispose();
  });
}
