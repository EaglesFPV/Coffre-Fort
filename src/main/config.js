'use strict';

const path = require('node:path');
const { app } = require('electron');

const isDev = !app.isPackaged && process.argv.includes('--dev');

const vaultPath = isDev && process.env.COFFRE_VAULT
  ? path.resolve(process.env.COFFRE_VAULT)
  : path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'CoffreFort', 'coffre.cfv');

module.exports = Object.freeze({
  isDev,
  vaultPath,
  vaultDir: path.dirname(vaultPath),
  rendererDir: path.join(__dirname, '..', 'renderer'),
  preloadPath: path.join(__dirname, '..', 'preload', 'index.js'),
  iconPath: path.join(__dirname, 'assets', 'icon.png'),
  startHidden: process.argv.includes('--hidden'),
  globalShortcuts: Object.freeze({
    none: null,
    'ctrl-alt-k': 'CommandOrControl+Alt+K',
    'ctrl-shift-k': 'CommandOrControl+Shift+K',
    'ctrl-alt-v': 'CommandOrControl+Alt+V',
    'ctrl-shift-space': 'CommandOrControl+Shift+Space',
  }),
  masterPasswordGraceMs: 2 * 60 * 1000,
  scheme: 'app',
  host: 'coffre-fort',
  origin: 'app://coffre-fort',
  entryUrl: 'app://coffre-fort/index.html',
  defaultClipboardSeconds: 20,
  minMasterPasswordLength: 12,
  minMasterPasswordScore: 3,
  autoLockPollMs: 5_000,
  updateFirstCheckMs: 5_000,
  updateCheckIntervalMs: 6 * 60 * 60 * 1000,
});
