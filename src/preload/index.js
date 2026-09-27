'use strict';

const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function subscribe(channel) {
  return (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('coffre', {
  vault: {
    state: () => invoke('vault:state'),
    create: (password) => invoke('vault:create', password),
    unlock: (password) => invoke('vault:unlock', password),
    lock: () => invoke('vault:lock'),
    activity: () => invoke('vault:activity'),
    confirmMasterPassword: (password) => invoke('vault:confirm-master', password),
    changeMasterPassword: (current, next) => invoke('vault:change-master', current, next),
    changeProtectionLevel: (password, level) => invoke('vault:protection', password, level),
    updateSettings: (changes) => invoke('vault:settings', changes),
    backup: () => invoke('vault:backup'),
    openFolder: () => invoke('vault:open-folder'),
  },
  items: {
    list: () => invoke('items:list'),
    reveal: (id, field) => invoke('items:reveal', id, field),
    save: (item) => invoke('items:save', item),
    remove: (id) => invoke('items:remove', id),
    setFavorite: (id, value) => invoke('items:favorite', id, value),
    copy: (id, field) => invoke('items:copy', id, field),
    openUrl: (id) => invoke('items:open-url', id),
  },
  identities: {
    save: (id, fields) => invoke('identities:save', id, fields),
    remove: (id) => invoke('identities:remove', id),
    copy: (id, field) => invoke('identities:copy', id, field),
  },
  passwords: {
    generate: (options) => invoke('passwords:generate', options),
    estimate: (password) => invoke('passwords:estimate', password),
    copy: (password) => invoke('passwords:copy', password),
  },
  app: {
    info: () => invoke('app:info'),
    updatePreferences: (changes) => invoke('app:preferences', changes),
    checkForUpdates: () => invoke('update:check'),
    installUpdate: () => invoke('update:install'),
  },
  events: {
    onLocked: subscribe('vault:locked'),
    onClipboardCleared: subscribe('clipboard:cleared'),
    onUpdateStatus: subscribe('update:status'),
  },
});
