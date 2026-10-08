'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { Vault } = require('../src/core/vault');
const { FrameDecoder, FrameError, encodeFrame } = require('../src/core/frames');
const { BrowserBridge, pairingCode } = require('../src/main/browser-bridge');

const FAST_KDF = { t: 1, m: 8 * 1024, p: 1 };
const ORIGIN = 'chrome-extension://ppbcnkclnpbghmaeglncpfphkcldhjdp/';
const HOST_EXE = path.join(__dirname, '..', 'native-host', 'bin', 'coffre-fort-host.exe');
const USER_PIPE = `\\\\.\\pipe\\coffre-fort-browser-${Buffer.from(os.userInfo().username, 'utf8').toString('hex')}`;
const KEY = 'a'.repeat(64);

async function createVault() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coffre-test-')), 'test.cfv');
  const vault = await Vault.create(file, 'cheval agrafe batterie correcte', FAST_KDF);
  const bank = vault.add({ title: 'Banque', username: 'client42', password: 'S3cret!Banque', url: 'banque.fr' });
  const mail = vault.add({ title: 'Messagerie', email: 'moi@exemple.fr', password: 'S3cret!Mail', url: 'https://mail.exemple.fr/login' });
  vault.add({ type: 'note', title: 'Note', notes: 'banque.fr secret' });
  return { vault, bank, mail };
}

function createBridge(overrides = {}) {
  const state = { vault: overrides.vault ?? null, approve: true, needsMaster: false, calls: [] };
  const bridge = new BrowserBridge({
    pipePath: overrides.pipePath ?? `\\\\.\\pipe\\coffre-fort-test-${crypto.randomUUID()}`,
    allowedOrigins: [ORIGIN],
    version: '9.9.9',
    getVault: () => state.vault,
    needsMasterPassword: () => state.needsMaster,
    touch: () => state.calls.push('touch'),
    showWindow: () => state.calls.push('show'),
    confirmPairing: async (request) => {
      state.calls.push(['pairing', request]);
      return state.approve;
    },
    requestMasterPassword: () => state.calls.push('master'),
    ...overrides.options,
  });
  return { bridge, state, pipePath: overrides.pipePath };
}

function frameClient(readable, writable) {
  const decoder = new FrameDecoder();
  const waiting = new Map();
  let nextId = 1;
  readable.on('data', (chunk) => {
    for (const message of decoder.push(chunk)) {
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
    }
  });
  return {
    send: (message) => writable.write(encodeFrame(message)),
    request: (type, payload = {}) => new Promise((resolve) => {
      const id = nextId++;
      waiting.set(id, resolve);
      writable.write(encodeFrame({ id, type, ...payload }));
    }),
  };
}

function connect(pipePath, origin = ORIGIN) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(pipePath, () => {
      const client = frameClient(socket, socket);
      client.send({ type: 'hello', origin });
      resolve({ socket, ...client });
    });
    socket.once('error', reject);
  });
}

async function withBridge(overrides, run) {
  const pipePath = `\\\\.\\pipe\\coffre-fort-test-${crypto.randomUUID()}`;
  const { bridge, state } = createBridge({ ...overrides, pipePath });
  await bridge.start();
  try {
    await run({ bridge, state, pipePath });
  } finally {
    bridge.stop();
  }
}

test('encode et décode les messages, refuse les messages trop gros ou invalides', () => {
  const decoder = new FrameDecoder();
  const frame = encodeFrame({ id: 1, texte: 'é€🔑' });
  assert.deepEqual(decoder.push(frame.subarray(0, 3)), []);
  assert.deepEqual(decoder.push(Buffer.concat([frame.subarray(3), frame])), [{ id: 1, texte: 'é€🔑' }, { id: 1, texte: 'é€🔑' }]);

  const oversized = Buffer.alloc(4);
  oversized.writeUInt32LE(8 * 1024 * 1024);
  assert.throws(() => new FrameDecoder().push(oversized), FrameError);
  const garbage = Buffer.concat([Buffer.from([3, 0, 0, 0]), Buffer.from('abc')]);
  assert.throws(() => new FrameDecoder().push(garbage), FrameError);
  const array = Buffer.concat([Buffer.from([2, 0, 0, 0]), Buffer.from('[]')]);
  assert.throws(() => new FrameDecoder().push(array), FrameError);
});

test('ferme la connexion des extensions inconnues', async () => {
  await withBridge({}, async ({ pipePath }) => {
    const { socket } = await connect(pipePath, 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/');
    await new Promise((resolve) => socket.once('close', resolve));
    assert.equal(socket.destroyed, true);
  });
});

test("n'expose rien tant que le navigateur n'est pas associé", async () => {
  const { vault, bank } = await createVault();
  await withBridge({ vault }, async ({ pipePath }) => {
    const client = await connect(pipePath);
    assert.deepEqual((await client.request('status', { key: KEY })).value, { version: '9.9.9', locked: false, paired: false });
    for (const [type, payload] of [
      ['list', { url: 'https://banque.fr' }],
      ['search', { query: 'banque' }],
      ['fill', { entryId: bank.id, url: 'https://banque.fr' }],
      ['list', { key: 'b'.repeat(64), url: 'https://banque.fr' }],
      ['list', { key: null, url: 'https://banque.fr' }],
    ]) {
      const reply = await client.request(type, payload);
      assert.equal(reply.ok, false, type);
      assert.equal(reply.code, 'unpaired', type);
    }
    assert.equal((await client.request('inconnu')).code, 'unknown');
    client.socket.destroy();
  });
});

test("associe un navigateur seulement après accord dans l'application", async () => {
  const { vault } = await createVault();
  await withBridge({ vault }, async ({ pipePath, state }) => {
    const client = await connect(pipePath);
    assert.equal((await client.request('pair', { key: 'trop-court', browser: 'Edge' })).code, 'invalid');

    state.approve = false;
    assert.equal((await client.request('pair', { key: KEY, browser: 'Edge' })).code, 'refused');
    assert.equal(vault.isBrowserPaired(KEY), false);

    state.approve = true;
    assert.deepEqual((await client.request('pair', { key: KEY, browser: 'Edge<script>' })).value, { paired: true });
    const prompt = state.calls.findLast((call) => Array.isArray(call))[1];
    assert.deepEqual(prompt, { code: pairingCode(KEY), browser: 'Edgescript' });
    assert.match(prompt.code, /^\d{3} \d{3}$/);
    assert.equal(vault.isBrowserPaired(KEY), true);
    assert.deepEqual(vault.browsers.map((browser) => browser.name), ['Edgescript']);
    assert.equal((await client.request('status', { key: KEY })).value.paired, true);

    vault.unpairBrowser(vault.browsers[0].id);
    assert.equal((await client.request('list', { key: KEY, url: 'https://banque.fr' })).code, 'unpaired');
    client.socket.destroy();
  });
});

test('ne propose que les comptes du site affiché, sans jamais lister de mot de passe', async () => {
  const { vault, bank, mail } = await createVault();
  vault.pairBrowser('Edge', KEY);
  await withBridge({ vault }, async ({ pipePath }) => {
    const client = await connect(pipePath);
    const list = await client.request('list', { key: KEY, url: 'https://www.banque.fr/connexion' });
    assert.deepEqual(list.value, { host: 'banque.fr', secure: true, items: [{ id: bank.id, title: 'Banque', username: 'client42', host: 'banque.fr' }] });
    assert.deepEqual((await client.request('list', { key: KEY, url: 'https://banque.fr.pirate.io/' })).value.items, []);
    assert.deepEqual((await client.request('list', { key: KEY, url: 'https://exemple.fr/' })).value.items, []);

    const search = await client.request('search', { key: KEY, query: 'EXEMPLE' });
    assert.deepEqual(search.value.items, [{ id: mail.id, title: 'Messagerie', username: 'moi@exemple.fr', host: 'mail.exemple.fr' }]);
    assert.deepEqual((await client.request('search', { key: KEY, query: 'secret' })).value.items, []);
    assert.equal(JSON.stringify([list, search]).includes('S3cret'), false);
    client.socket.destroy();
  });
});

test('ne remplit que sur le bon site, sauf confirmation explicite sur une page sécurisée', async () => {
  const { vault, bank } = await createVault();
  vault.pairBrowser('Edge', KEY);
  await withBridge({ vault }, async ({ pipePath, state }) => {
    const client = await connect(pipePath);
    const fill = (url, extra = {}) => client.request('fill', { key: KEY, entryId: bank.id, url, ...extra });

    assert.deepEqual((await fill('https://banque.fr/login')).value, { username: 'client42', password: 'S3cret!Banque' });
    assert.equal(state.calls.includes('touch'), true);
    assert.equal((await fill('https://banque.fr.pirate.io/login')).code, 'mismatch');
    assert.equal((await fill('http://banque.fr/login')).code, 'insecure');
    assert.equal((await fill('http://pirate.io/', { allowMismatch: true })).code, 'insecure');
    assert.equal((await fill('https://autre-site.fr/', { allowMismatch: 'oui' })).code, 'mismatch');
    assert.equal((await fill('https://autre-site.fr/', { allowMismatch: true })).value.password, 'S3cret!Banque');
    assert.equal((await client.request('fill', { key: KEY, entryId: 'inconnu', url: 'https://banque.fr' })).code, 'not-found');
    client.socket.destroy();
  });
});

test('respecte le verrouillage et le mot de passe maître exigé', async () => {
  const { vault, bank } = await createVault();
  vault.pairBrowser('Edge', KEY);
  await withBridge({ vault }, async ({ pipePath, state }) => {
    const client = await connect(pipePath);
    state.needsMaster = true;
    assert.equal((await client.request('fill', { key: KEY, entryId: bank.id, url: 'https://banque.fr' })).code, 'master-required');
    assert.equal(state.calls.includes('master'), true);

    state.vault = null;
    assert.deepEqual((await client.request('status', { key: KEY })).value, { version: '9.9.9', locked: true, paired: false });
    assert.equal((await client.request('list', { key: KEY, url: 'https://banque.fr' })).code, 'locked');
    assert.equal((await client.request('pair', { key: 'c'.repeat(64) })).code, 'locked');
    assert.equal((await client.request('focus')).ok, true);
    assert.equal(state.calls.includes('show'), true);
    client.socket.destroy();
  });
});

async function userPipeIsFree() {
  const probe = net.createServer();
  try {
    await new Promise((resolve, reject) => probe.once('error', reject).listen(USER_PIPE, resolve));
    await new Promise((resolve) => probe.close(resolve));
    return true;
  } catch {
    return false;
  }
}

function launchHost() {
  const child = spawn(HOST_EXE, [ORIGIN, '--parent-window=0'], { stdio: ['pipe', 'pipe', 'ignore'] });
  return { child, ...frameClient(child.stdout, child.stdin) };
}

test('le relais natif transmet les messages entre le navigateur et l’application', { skip: !fs.existsSync(HOST_EXE) }, async (t) => {
  if (!(await userPipeIsFree())) return t.skip('Coffre-Fort utilise déjà la liaison navigateur sur cette session.');

  const offline = launchHost();
  const reply = await offline.request('status', { key: KEY });
  assert.equal(reply.ok, false);
  assert.equal(reply.code, 'app-not-running');
  offline.child.stdin.end();
  await new Promise((resolve) => offline.child.once('exit', resolve));

  const { vault, bank } = await createVault();
  vault.pairBrowser('Edge', KEY);
  const { bridge } = createBridge({ vault, pipePath: USER_PIPE });
  await bridge.start();
  try {
    const host = launchHost();
    assert.deepEqual((await host.request('status', { key: KEY })).value, { version: '9.9.9', locked: false, paired: true });
    assert.equal((await host.request('list', { key: KEY, url: 'https://banque.fr/' })).value.items[0].id, bank.id);
    assert.equal((await host.request('fill', { key: KEY, entryId: bank.id, url: 'https://banque.fr/' })).value.password, 'S3cret!Banque');
    host.child.stdin.end();
    const code = await new Promise((resolve) => host.child.once('exit', resolve));
    assert.equal(code, 0);
  } finally {
    bridge.stop();
  }
});
