'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Vault, VaultError, WrongPasswordError, PAD_BLOCK, PROTECTION_LEVELS, normalizeIdentity } = require('../src/core/vault');

const FAST_KDF = { t: 1, m: 8 * 1024, p: 1 };
const PASSWORD = 'cheval agrafe batterie correcte';

function temporaryVaultPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coffre-test-')), 'test.cfv');
}

test('chiffre puis déchiffre les identifiants et les notes', async () => {
  const file = temporaryVaultPath();
  const vault = await Vault.create(file, PASSWORD, FAST_KDF);
  vault.add({ title: 'Messagerie', username: 'moi', password: 'sécret€🔑', category: 'Travail', favorite: true });
  vault.add({ type: 'note', title: 'Wi-Fi', notes: 'code : 1234' });

  const [login, note] = (await Vault.open(file, PASSWORD)).entries;
  assert.equal(login.password, 'sécret€🔑');
  assert.equal(login.favorite, true);
  assert.equal(login.category, 'Travail');
  assert.equal(note.type, 'note');
  assert.equal(note.notes, 'code : 1234');
});

test('refuse un mauvais mot de passe', async () => {
  const file = temporaryVaultPath();
  await Vault.create(file, PASSWORD, FAST_KDF);
  await assert.rejects(Vault.open(file, `${PASSWORD}x`), WrongPasswordError);
});

test("n'écrit rien en clair sur le disque", async () => {
  const file = temporaryVaultPath();
  const vault = await Vault.create(file, PASSWORD, FAST_KDF);
  vault.add({ title: 'TITRE-SECRET', username: 'IDENT-SECRET', password: 'MDP-SECRET' });
  const blob = fs.readFileSync(file);
  for (const marker of ['TITRE-SECRET', 'IDENT-SECRET', 'MDP-SECRET', PASSWORD]) {
    assert.equal(blob.includes(Buffer.from(marker)), false, marker);
  }
});

test('détecte toute modification du fichier', async () => {
  const file = temporaryVaultPath();
  (await Vault.create(file, PASSWORD, FAST_KDF)).add({ title: 'a', password: 'b' });
  const original = fs.readFileSync(file);
  const headerEnd = 12 + original.readUInt32BE(8);
  const saltPosition = original.indexOf('"salt":"') + 8;
  for (const position of [3, saltPosition, headerEnd + 1, Math.floor(original.length / 2), original.length - 1]) {
    const tampered = Buffer.from(original);
    tampered[position] ^= 0x01;
    fs.writeFileSync(file, tampered);
    await assert.rejects(Vault.open(file, PASSWORD), VaultError, `octet ${position}`);
  }
});

test("ne révèle pas le nombre d'éléments par la taille du fichier", async () => {
  const file = temporaryVaultPath();
  const vault = await Vault.create(file, PASSWORD, FAST_KDF);
  const emptySize = fs.statSync(file).size;
  for (let i = 0; i < 3; i++) vault.add({ title: `site ${i}`, password: 'x'.repeat(16) });
  assert.equal(fs.statSync(file).size, emptySize);
  assert.ok(emptySize > PAD_BLOCK);
});

test('modifie, date le changement de mot de passe et supprime', async () => {
  const file = temporaryVaultPath();
  const vault = await Vault.create(file, PASSWORD, FAST_KDF);
  const entry = vault.add({ title: 'a', password: '1' });
  vault.update(entry.id, { title: 'b' });
  assert.equal(vault.get(entry.id).passwordModified, entry.passwordModified);
  vault.update(entry.id, { password: '2' });
  assert.equal((await Vault.open(file, PASSWORD)).get(entry.id).password, '2');
  vault.remove(entry.id);
  assert.deepEqual((await Vault.open(file, PASSWORD)).entries, []);
  assert.throws(() => vault.remove(entry.id), VaultError);
});

test('change le mot de passe maître, copie de secours comprise', async () => {
  const file = temporaryVaultPath();
  const vault = await Vault.create(file, PASSWORD, FAST_KDF);
  vault.add({ title: 'a' });
  assert.equal(await vault.checkPassword(PASSWORD), true);
  assert.equal(await vault.checkPassword('faux'), false);
  await vault.changePassword('nouveau mot de passe maître');
  await assert.rejects(Vault.open(file, PASSWORD), WrongPasswordError);
  assert.equal((await Vault.open(file, 'nouveau mot de passe maître')).entries.length, 1);
  await assert.rejects(Vault.open(`${file}.bak`, PASSWORD), WrongPasswordError);
});

test("empêche une seconde instance d'écraser les changements", async () => {
  const file = temporaryVaultPath();
  await Vault.create(file, PASSWORD, FAST_KDF);
  const first = await Vault.open(file, PASSWORD);
  const second = await Vault.open(file, PASSWORD);
  first.add({ title: 'a' });
  assert.throws(() => second.add({ title: 'b' }), VaultError);
  assert.deepEqual((await Vault.open(file, PASSWORD)).entries.map((entry) => entry.title), ['a']);
});

test('refuse tout accès une fois verrouillé', async () => {
  const vault = await Vault.create(temporaryVaultPath(), PASSWORD, FAST_KDF);
  vault.lock();
  assert.equal(vault.isLocked, true);
  assert.throws(() => vault.entries, VaultError);
  assert.throws(() => vault.add({ title: 'x' }), VaultError);
});

test('valide et chiffre les réglages', async () => {
  const file = temporaryVaultPath();
  const vault = await Vault.create(file, PASSWORD, FAST_KDF);
  assert.deepEqual(vault.settings, { autoLockMinutes: 5, clipboardSeconds: 20, lockOnMinimize: false, requireMasterPassword: false });
  vault.updateSettings({ autoLockMinutes: 15, clipboardSeconds: 60, lockOnMinimize: true, requireMasterPassword: true });
  assert.deepEqual((await Vault.open(file, PASSWORD)).settings,
    { autoLockMinutes: 15, clipboardSeconds: 60, lockOnMinimize: true, requireMasterPassword: true });
  assert.throws(() => vault.updateSettings({ autoLockMinutes: 7 }), VaultError);
  assert.throws(() => vault.updateSettings({ requireMasterPassword: 'oui' }), VaultError);
  assert.throws(() => vault.updateSettings({ inconnu: true }), VaultError);
});

test("gère des profils d'identité complets avec un seul profil par défaut", async () => {
  const file = temporaryVaultPath();
  const vault = await Vault.create(file, PASSWORD, FAST_KDF);
  const personal = vault.saveIdentity(null, {
    name: 'Personnel', fullName: 'Jean Dupont', email: ' moi@exemple.fr ', phone: '06 12 34 56 78', address: '1 rue X\n75000 Paris', isDefault: true,
  });
  const gaming = vault.saveIdentity(null, { name: 'Jeux', username: 'LeJoueur', isDefault: true });
  const reopened = await Vault.open(file, PASSWORD);
  const saved = reopened.identities.find((identity) => identity.id === personal);
  assert.equal(saved.email, 'moi@exemple.fr');
  assert.equal(saved.phone, '06 12 34 56 78');
  assert.equal(saved.address, '1 rue X\n75000 Paris');
  assert.equal(saved.username, '');
  assert.deepEqual(reopened.identities.filter((identity) => identity.isDefault).map((identity) => identity.id), [gaming]);
  for (const marker of ['LeJoueur', 'Jean Dupont', '06 12 34 56 78']) {
    assert.equal(fs.readFileSync(file).includes(Buffer.from(marker)), false, marker);
  }

  vault.saveIdentity(gaming, { name: 'Jeux', username: 'LeJoueur42' });
  assert.equal(vault.identities.find((identity) => identity.id === gaming).username, 'LeJoueur42');
  vault.removeIdentity(personal);
  assert.equal(vault.identities.length, 1);
  assert.throws(() => vault.saveIdentity(null, { name: 'Vide', email: '   ' }), VaultError);
  assert.throws(() => vault.saveIdentity(null, { name: '', email: 'a@b.c' }), VaultError);
});

test('convertit les anciennes identités en profils', () => {
  assert.deepEqual(normalizeIdentity({ id: 'a', kind: 'email', label: 'Travail', value: 'j@pro.fr', isDefault: true }),
    { id: 'a', name: 'Travail', fullName: '', email: 'j@pro.fr', username: '', phone: '', address: '', isDefault: true });
  assert.deepEqual(normalizeIdentity({ id: 'b', kind: 'phone', label: '', value: '0600000000' }),
    { id: 'b', name: 'Téléphone', fullName: '', email: '', username: '', phone: '0600000000', address: '', isDefault: false });
});

test("enregistre l'e-mail et le téléphone d'un identifiant", async () => {
  const file = temporaryVaultPath();
  const vault = await Vault.create(file, PASSWORD, FAST_KDF);
  const entry = vault.add({ title: 'Banque', username: 'client123', email: 'moi@exemple.fr', phone: '0600000000', password: 'x' });
  const saved = (await Vault.open(file, PASSWORD)).get(entry.id);
  assert.equal(saved.email, 'moi@exemple.fr');
  assert.equal(saved.phone, '0600000000');
});

test('change le niveau de protection sans perdre les données', async () => {
  const file = temporaryVaultPath();
  const vault = await Vault.create(file, PASSWORD, FAST_KDF);
  vault.add({ title: 'a', password: 'b' });
  assert.equal(vault.protectionLevel, 'custom');
  await vault.changePassword(PASSWORD, PROTECTION_LEVELS.standard);
  assert.equal(vault.protectionLevel, 'standard');
  const reopened = await Vault.open(file, PASSWORD);
  assert.equal(reopened.protectionLevel, 'standard');
  assert.equal(reopened.entries[0].password, 'b');
});

test('refuse des paramètres Argon2 déraisonnables', async () => {
  await assert.rejects(Vault.create(temporaryVaultPath(), PASSWORD, { t: 1, m: 1024, p: 1 }), VaultError);
});

test("ne confond pas un fichier quelconque avec un coffre", async () => {
  const file = temporaryVaultPath();
  fs.writeFileSync(file, 'bonjour, je ne suis pas un coffre');
  await assert.rejects(Vault.open(file, PASSWORD), VaultError);
});
