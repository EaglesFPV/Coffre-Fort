'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, dialog, ipcMain, shell } = require('electron');
const { VaultError, IDENTITY_FIELDS } = require('../core/vault');
const passwords = require('../core/passwords');
const { analyze } = require('../core/health');
const { UserError } = require('./errors');
const { isTrustedSender } = require('./security');
const config = require('./config');

const PROTECTED_FIELDS = Object.freeze(['password', 'notes']);
const COPYABLE_FIELDS = Object.freeze(['username', 'email', 'phone', ...PROTECTED_FIELDS]);
const MASTER_PASSWORD_REQUIRED = Object.freeze({ requiresMasterPassword: true });

function text(value, max = 200_000) {
  if (typeof value !== 'string' || value.length > max) throw new UserError('Donnée invalide.');
  return value;
}

function object(value) {
  return value && typeof value === 'object' ? value : {};
}

function toWebUrl(raw) {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new UserError('Adresse de site invalide.');
  }
  if (!['https:', 'http:'].includes(url.protocol)) throw new UserError('Seules les adresses web (http/https) peuvent être ouvertes.');
  return url.href;
}

function snapshot(vault) {
  const entries = vault.entries;
  const { perEntry, summary } = analyze(entries);
  return {
    items: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      username: entry.username,
      email: entry.email,
      phone: entry.phone,
      url: entry.url,
      category: entry.category,
      favorite: entry.favorite,
      created: entry.created,
      modified: entry.modified,
      passwordModified: entry.passwordModified,
      hasPassword: entry.password !== '',
      hasNotes: entry.notes !== '',
      health: perEntry.get(entry.id) ?? null,
    })),
    identities: vault.identities,
    health: summary,
    settings: vault.settings,
    protectionLevel: vault.protectionLevel,
  };
}

function registerIpc({ vaultSession, secretClipboard, preferences, updater, system, getWindow }) {
  const handle = (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrustedSender(event.senderFrame)) return { ok: false, error: 'Appel refusé.' };
      vaultSession.touch();
      try {
        return { ok: true, value: await handler(...args) };
      } catch (error) {
        const expected = error instanceof VaultError || error instanceof UserError;
        if (!expected) console.error(error);
        return { ok: false, error: expected ? error.message : `Erreur inattendue : ${error.message}` };
      }
    });
  };

  const entry = (id) => {
    const found = vaultSession.vault.get(text(id, 100));
    if (!found) throw new UserError('Élément introuvable.');
    return found;
  };

  const identity = (id) => {
    const found = vaultSession.vault.identities.find((candidate) => candidate.id === text(id, 100));
    if (!found) throw new UserError('Identité introuvable.');
    return found;
  };

  handle('vault:state', () => ({ exists: vaultSession.exists, unlocked: vaultSession.isUnlocked, path: config.vaultPath }));
  handle('vault:create', (password) => vaultSession.create(password));
  handle('vault:unlock', (password) => vaultSession.unlock(password));
  handle('vault:lock', () => vaultSession.lock('manual'));
  handle('vault:activity', () => undefined);
  handle('vault:confirm-master', (password) => vaultSession.confirmMasterPassword(password));
  handle('vault:change-master', (current, next) => vaultSession.changeMasterPassword(current, next));
  handle('vault:protection', (password, level) => vaultSession.changeProtectionLevel(password, level));
  handle('vault:settings', (changes) => vaultSession.vault.updateSettings(object(changes)));
  handle('vault:open-folder', () => shell.openPath(config.vaultDir).then(() => undefined));
  handle('vault:backup', async () => {
    vaultSession.assertUnlocked();
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(getWindow(), {
      title: 'Sauvegarder une copie chiffrée du coffre',
      defaultPath: path.join(app.getPath('documents'), `coffre-${stamp}.cfv`),
      filters: [{ name: 'Coffre chiffré', extensions: ['cfv'] }],
    });
    if (canceled || !filePath) return false;
    if (path.resolve(filePath).toLowerCase() === path.resolve(config.vaultPath).toLowerCase()) {
      throw new UserError('Choisissez un autre emplacement que le coffre lui-même.');
    }
    fs.copyFileSync(config.vaultPath, filePath);
    return true;
  });

  handle('items:list', () => snapshot(vaultSession.vault));
  handle('items:reveal', (id, field) => {
    if (!PROTECTED_FIELDS.includes(field)) throw new UserError('Champ inconnu.');
    const value = entry(id)[field];
    if (vaultSession.needsMasterPassword) return MASTER_PASSWORD_REQUIRED;
    return { value };
  });
  handle('items:save', (item) => {
    const source = object(item);
    const fields = {
      type: source.type === 'note' ? 'note' : 'login',
      title: text(source.title ?? '', 500).trim(),
      username: text(source.username ?? '', 1000),
      email: text(source.email ?? '', 1000).trim(),
      phone: text(source.phone ?? '', 100).trim(),
      password: text(source.password ?? '', 10_000),
      url: text(source.url ?? '', 2000).trim(),
      category: text(source.category ?? '', 100).trim(),
      notes: text(source.notes ?? ''),
      favorite: source.favorite === true,
    };
    if (!fields.title) throw new UserError('Donnez un nom à cet élément.');
    if (source.id) {
      entry(source.id);
      vaultSession.vault.update(source.id, fields);
      return source.id;
    }
    return vaultSession.vault.add(fields).id;
  });
  handle('items:remove', (id) => {
    entry(id);
    vaultSession.vault.remove(id);
  });
  handle('items:favorite', (id, value) => {
    entry(id);
    vaultSession.vault.update(id, { favorite: value === true });
  });
  handle('items:copy', (id, field) => {
    if (!COPYABLE_FIELDS.includes(field)) throw new UserError('Champ inconnu.');
    const value = entry(id)[field];
    if (!value) throw new UserError('Rien à copier.');
    if (PROTECTED_FIELDS.includes(field) && vaultSession.needsMasterPassword) return MASTER_PASSWORD_REQUIRED;
    return secretClipboard.copy(value);
  });
  handle('items:open-url', async (id) => {
    const raw = entry(id).url.trim();
    if (!raw) throw new UserError("Cet identifiant n'a pas d'adresse de site.");
    await shell.openExternal(toWebUrl(raw));
  });

  handle('identities:save', (id, fields) => vaultSession.vault.saveIdentity(id ? text(id, 100) : null, object(fields)));
  handle('identities:remove', (id) => vaultSession.vault.removeIdentity(text(id, 100)));
  handle('identities:copy', (id, field) => {
    if (!IDENTITY_FIELDS.includes(field)) throw new UserError('Champ inconnu.');
    const value = identity(id)[field];
    if (!value) throw new UserError('Rien à copier.');
    return secretClipboard.copy(value);
  });

  handle('passwords:generate', (options) => passwords.generate(object(options)));
  handle('passwords:estimate', (password) => passwords.estimate(text(password, 10_000)));
  handle('passwords:copy', (password) => {
    vaultSession.assertUnlocked();
    return secretClipboard.copy(text(password, 1000));
  });

  handle('app:info', () => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    preferences: preferences.values,
    update: updater.status,
  }));
  handle('app:preferences', (changes) => {
    const next = preferences.preview(object(changes));
    system.apply(next);
    updater.setAutomatic(next.autoUpdate);
    return preferences.save(next);
  });
  handle('update:check', () => updater.check());
  handle('update:install', () => updater.install());
}

module.exports = { registerIpc };
