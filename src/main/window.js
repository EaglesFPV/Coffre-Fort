'use strict';

const { BrowserWindow } = require('electron');
const config = require('./config');

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Coffre-Fort',
    backgroundColor: '#0b2d35',
    webPreferences: {
      preload: config.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: config.isDev,
      navigateOnDragDrop: false,
      safeDialogs: true,
    },
  });
  window.setContentProtection(true);
  window.once('ready-to-show', () => window.show());
  window.loadURL(config.entryUrl);
  return window;
}

module.exports = { createMainWindow };
