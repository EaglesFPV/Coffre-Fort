'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'extension', 'manifest.json');

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const [release] = version.split('-');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

if (manifest.version !== release) {
  manifest.version = release;
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(`extension ${release}`);
