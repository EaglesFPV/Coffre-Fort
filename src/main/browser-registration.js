'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const BROWSER_KEYS = Object.freeze([
  'HKCU\\Software\\Microsoft\\Edge',
  'HKCU\\Software\\Google\\Chrome',
  'HKCU\\Software\\BraveSoftware\\Brave-Browser',
]);

function reg(args) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true }, (error) => resolve(!error));
  });
}

const hostKey = (browserKey, hostName) => `${browserKey}\\NativeMessagingHosts\\${hostName}`;

async function register({ hostName, hostPath, manifestPath, extensionId }) {
  const manifest = {
    name: hostName,
    description: 'Coffre-Fort',
    path: hostPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const registered = [];
  for (const browserKey of BROWSER_KEYS) {
    if (!(await reg(['query', browserKey]))) continue;
    if (await reg(['add', hostKey(browserKey, hostName), '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'])) {
      registered.push(browserKey);
    }
  }
  return registered;
}

async function unregister({ hostName, manifestPath }) {
  for (const browserKey of BROWSER_KEYS) await reg(['delete', hostKey(browserKey, hostName), '/f']);
  fs.rmSync(manifestPath, { force: true });
}

module.exports = { register, unregister };
