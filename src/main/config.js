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
  scheme: 'app',
  host: 'coffre-fort',
  origin: 'app://coffre-fort',
  entryUrl: 'app://coffre-fort/index.html',
  clipboardClearSeconds: 20,
  minMasterPasswordLength: 12,
  minMasterPasswordScore: 3,
  autoLockPollMs: 5_000,
  updateFirstCheckMs: 5_000,
  updateCheckIntervalMs: 6 * 60 * 60 * 1000,
});
