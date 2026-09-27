'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { argon2id } = require('hash-wasm');

const MAGIC = Buffer.from('CFVAULT\x01', 'latin1');
const SALT_LEN = 16;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const MAX_HEADER_LEN = 64 * 1024;
const PAD_BLOCK = 4096;

const DEFAULT_KDF = Object.freeze({ t: 3, m: 256 * 1024, p: 4 });
const KDF_LIMITS = Object.freeze({ t: [1, 50], m: [8 * 1024, 4 * 1024 * 1024], p: [1, 64] });

const TEXT_FIELDS = Object.freeze(['title', 'username', 'password', 'url', 'notes', 'category']);
const TYPES = Object.freeze(['login', 'note']);
const AUTO_LOCK_CHOICES = Object.freeze([1, 5, 15, 30, 60]);
const DEFAULT_SETTINGS = Object.freeze({ autoLockMinutes: 5 });

class VaultError extends Error {}
class WrongPasswordError extends VaultError {}

const now = () => Math.floor(Date.now() / 1000);
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest();

async function deriveKey(password, salt, kdf) {
  const hash = await argon2id({
    password: String(password).normalize('NFC'),
    salt,
    iterations: kdf.t,
    memorySize: kdf.m,
    parallelism: kdf.p,
    hashLength: KEY_LEN,
    outputType: 'binary',
  });
  return Buffer.from(hash);
}

function assertKdf(kdf) {
  for (const [name, [low, high]] of Object.entries(KDF_LIMITS)) {
    const value = kdf[name];
    if (!Number.isInteger(value) || value < low || value > high) {
      throw new VaultError('Paramètres de chiffrement du coffre invalides.');
    }
  }
}

function decodeBase64(text, expectedLength) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
    throw new VaultError('En-tête du coffre invalide.');
  }
  const bytes = Buffer.from(text, 'base64');
  if (bytes.length !== expectedLength) throw new VaultError('En-tête du coffre invalide.');
  return bytes;
}

function parseContainer(blob) {
  if (blob.length < MAGIC.length + 4 || !blob.subarray(0, 7).equals(MAGIC.subarray(0, 7))) {
    throw new VaultError("Ce fichier n'est pas un coffre.");
  }
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new VaultError('Version de coffre non prise en charge.');
  }
  const headerLength = blob.readUInt32BE(MAGIC.length);
  const headerEnd = MAGIC.length + 4 + headerLength;
  if (headerLength > MAX_HEADER_LEN || headerEnd + TAG_LEN > blob.length) {
    throw new VaultError('En-tête du coffre invalide.');
  }
  let header;
  try {
    header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(blob.subarray(MAGIC.length + 4, headerEnd)));
  } catch {
    throw new VaultError('En-tête du coffre invalide.');
  }
  if (!header || typeof header !== 'object' || header.kdf !== 'argon2id' || header.cipher !== 'aes-256-gcm') {
    throw new VaultError('En-tête du coffre invalide.');
  }
  return { header, aad: blob.subarray(0, headerEnd), body: blob.subarray(headerEnd) };
}

function encrypt(key, salt, kdf, data) {
  const nonce = crypto.randomBytes(NONCE_LEN);
  const header = {
    cipher: 'aes-256-gcm',
    kdf: 'argon2id',
    m: kdf.m,
    nonce: nonce.toString('base64'),
    p: kdf.p,
    salt: salt.toString('base64'),
    t: kdf.t,
  };
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(headerBytes.length);
  const aad = Buffer.concat([MAGIC, headerLength, headerBytes]);

  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const plaintext = Buffer.alloc(Math.max(1, Math.ceil(json.length / PAD_BLOCK)) * PAD_BLOCK, 0x20);
  json.copy(plaintext);
  json.fill(0);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  const blob = Buffer.concat([aad, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  plaintext.fill(0);
  return blob;
}

function decrypt(key, nonce, aad, body) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(body.subarray(body.length - TAG_LEN));
  try {
    return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_LEN)), decipher.final()]);
  } catch {
    throw new WrongPasswordError('Mot de passe incorrect (ou fichier endommagé).');
  }
}

function readDigest(file) {
  try {
    return sha256(fs.readFileSync(file));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function writeAtomically(file, blob) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const temporary = `${file}.tmp`;
  const descriptor = fs.openSync(temporary, 'w');
  try {
    fs.writeSync(descriptor, blob);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.renameSync(temporary, file);
}

function normalizeEntry(raw) {
  const entry = { id: String(raw.id) };
  for (const name of TEXT_FIELDS) entry[name] = typeof raw[name] === 'string' ? raw[name] : '';
  entry.type = TYPES.includes(raw.type) ? raw.type : 'login';
  entry.favorite = raw.favorite === true;
  entry.created = Number.isInteger(raw.created) ? raw.created : now();
  entry.modified = Number.isInteger(raw.modified) ? raw.modified : entry.created;
  entry.passwordModified = Number.isInteger(raw.passwordModified) ? raw.passwordModified : entry.modified;
  return entry;
}

function normalizeData(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) {
    throw new VaultError('Contenu du coffre invalide.');
  }
  if (data.entries.some((entry) => !entry || typeof entry !== 'object' || typeof entry.id !== 'string')) {
    throw new VaultError('Contenu du coffre invalide.');
  }
  const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  return {
    version: 2,
    created: data.created ?? now(),
    modified: data.modified ?? now(),
    settings: { ...DEFAULT_SETTINGS, ...settings },
    entries: data.entries.map(normalizeEntry),
  };
}

function sanitizeFields(fields) {
  const clean = {};
  for (const name of TEXT_FIELDS) {
    if (fields[name] !== undefined) clean[name] = String(fields[name] ?? '');
  }
  if (fields.type !== undefined) {
    if (!TYPES.includes(fields.type)) throw new VaultError("Type d'élément inconnu.");
    clean.type = fields.type;
  }
  if (fields.favorite !== undefined) clean.favorite = fields.favorite === true;
  return clean;
}

class Vault {
  #path;
  #key;
  #salt;
  #kdf;
  #data;
  #digest;

  constructor(file, key, salt, kdf, data, digest) {
    this.#path = file;
    this.#key = key;
    this.#salt = salt;
    this.#kdf = kdf;
    this.#data = data;
    this.#digest = digest;
  }

  static async create(file, password, kdf = DEFAULT_KDF) {
    if (fs.existsSync(file)) throw new VaultError('Un coffre existe déjà à cet emplacement.');
    const params = { ...kdf };
    assertKdf(params);
    const salt = crypto.randomBytes(SALT_LEN);
    const key = await deriveKey(password, salt, params);
    const vault = new Vault(file, key, salt, params, normalizeData({ entries: [] }), null);
    vault.#write(vault.#data);
    return vault;
  }

  static async open(file, password) {
    const blob = fs.readFileSync(file);
    const { header, aad, body } = parseContainer(blob);
    const kdf = { t: header.t, m: header.m, p: header.p };
    assertKdf(kdf);
    const salt = decodeBase64(header.salt, SALT_LEN);
    const nonce = decodeBase64(header.nonce, NONCE_LEN);
    const key = await deriveKey(password, salt, kdf);
    let plaintext;
    try {
      plaintext = decrypt(key, nonce, aad, body);
    } catch (error) {
      key.fill(0);
      throw error;
    }
    let data;
    try {
      data = JSON.parse(plaintext.toString('utf8'));
    } catch {
      throw new VaultError('Contenu du coffre invalide.');
    } finally {
      plaintext.fill(0);
    }
    return new Vault(file, key, salt, kdf, normalizeData(data), sha256(blob));
  }

  get path() {
    return this.#path;
  }

  get isLocked() {
    return this.#key === null;
  }

  get entries() {
    this.#assertUnlocked();
    return structuredClone(this.#data.entries);
  }

  get settings() {
    this.#assertUnlocked();
    return { ...this.#data.settings };
  }

  lock() {
    if (this.#key) this.#key.fill(0);
    this.#key = null;
    this.#data = null;
  }

  async checkPassword(password) {
    this.#assertUnlocked();
    const candidate = await deriveKey(password, this.#salt, this.#kdf);
    const matches = crypto.timingSafeEqual(candidate, this.#key);
    candidate.fill(0);
    return matches;
  }

  async changePassword(newPassword, kdf = this.#kdf) {
    this.#assertUnlocked();
    const params = { ...kdf };
    assertKdf(params);
    const salt = crypto.randomBytes(SALT_LEN);
    const key = await deriveKey(newPassword, salt, params);
    const previous = [this.#key, this.#salt, this.#kdf];
    [this.#key, this.#salt, this.#kdf] = [key, salt, params];
    try {
      this.#write(this.#data);
    } catch (error) {
      [this.#key, this.#salt, this.#kdf] = previous;
      key.fill(0);
      throw error;
    }
    previous[0].fill(0);
    fs.copyFileSync(this.#path, `${this.#path}.bak`);
  }

  get(id) {
    this.#assertUnlocked();
    const entry = this.#data.entries.find((candidate) => candidate.id === id);
    return entry ? structuredClone(entry) : null;
  }

  add(fields) {
    const clean = sanitizeFields(fields);
    const timestamp = now();
    const entry = normalizeEntry({ ...clean, id: crypto.randomUUID(), created: timestamp, modified: timestamp, passwordModified: timestamp });
    this.#commit((data) => data.entries.push(entry));
    return structuredClone(entry);
  }

  update(id, fields) {
    const clean = sanitizeFields(fields);
    this.#commit((data) => {
      const entry = data.entries.find((candidate) => candidate.id === id);
      if (!entry) throw new VaultError('Élément introuvable.');
      const timestamp = now();
      if (clean.password !== undefined && clean.password !== entry.password) entry.passwordModified = timestamp;
      Object.assign(entry, clean);
      entry.modified = timestamp;
    });
  }

  remove(id) {
    this.#commit((data) => {
      const remaining = data.entries.filter((entry) => entry.id !== id);
      if (remaining.length === data.entries.length) throw new VaultError('Élément introuvable.');
      data.entries = remaining;
    });
  }

  updateSettings(settings) {
    this.#commit((data) => {
      if (settings.autoLockMinutes !== undefined) {
        const minutes = Number(settings.autoLockMinutes);
        if (!AUTO_LOCK_CHOICES.includes(minutes)) throw new VaultError('Délai de verrouillage invalide.');
        data.settings.autoLockMinutes = minutes;
      }
    });
  }

  #assertUnlocked() {
    if (this.#key === null) throw new VaultError('Le coffre est verrouillé.');
  }

  #commit(mutate) {
    this.#assertUnlocked();
    const data = structuredClone(this.#data);
    mutate(data);
    data.modified = now();
    this.#write(data);
    this.#data = data;
  }

  #write(data) {
    this.#assertUnlocked();
    const blob = encrypt(this.#key, this.#salt, this.#kdf, data);
    const current = readDigest(this.#path);
    const unchanged = current === null ? this.#digest === null : this.#digest !== null && current.equals(this.#digest);
    if (!unchanged) {
      throw new VaultError('Le fichier du coffre a été modifié en dehors de cette fenêtre. Verrouillez puis rouvrez le coffre.');
    }
    writeAtomically(this.#path, blob);
    this.#digest = sha256(blob);
  }
}

module.exports = { Vault, VaultError, WrongPasswordError, DEFAULT_KDF, PAD_BLOCK, AUTO_LOCK_CHOICES, deriveKey };
