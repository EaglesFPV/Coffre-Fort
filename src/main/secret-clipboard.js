'use strict';

const { EventEmitter } = require('node:events');
const { clipboard } = require('electron');

const windowsClipboard = process.platform === 'win32' ? require('./platform/windows-clipboard') : null;

class SecretClipboard extends EventEmitter {
  #getWindow;
  #getClearDelay;
  #token = null;
  #timer = null;

  constructor({ getWindow, getClearDelay }) {
    super();
    this.#getWindow = getWindow;
    this.#getClearDelay = getClearDelay;
  }

  copy(text) {
    const seconds = this.#getClearDelay();
    this.clear();
    if (windowsClipboard) {
      this.#token = { sequence: windowsClipboard.writeSecret(this.#windowHandle(), text) };
    } else {
      clipboard.writeText(text);
      this.#token = { text };
    }
    this.#timer = setTimeout(() => {
      this.clear();
      this.emit('cleared');
    }, seconds * 1000);
    return { seconds };
  }

  clear() {
    clearTimeout(this.#timer);
    this.#timer = null;
    const token = this.#token;
    this.#token = null;
    if (!token) return;
    try {
      if (windowsClipboard) windowsClipboard.clearIfUnchanged(this.#windowHandle(), token.sequence);
      else if (clipboard.readText() === token.text) clipboard.clear();
    } catch {
      return;
    }
  }

  #windowHandle() {
    const window = this.#getWindow();
    if (!window || window.isDestroyed()) return 0;
    const handle = window.getNativeWindowHandle();
    return Number(handle.length >= 8 ? handle.readBigUInt64LE(0) : handle.readUInt32LE(0));
  }
}

module.exports = { SecretClipboard };
