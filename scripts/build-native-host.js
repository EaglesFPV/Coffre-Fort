'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'native-host', 'Host.cs');
const OUTPUT = path.join(ROOT, 'native-host', 'bin', 'coffre-fort-host.exe');
const COMPILERS = ['Framework64', 'Framework'].map((flavor) =>
  path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', flavor, 'v4.0.30319', 'csc.exe'));

const compiler = COMPILERS.find((candidate) => fs.existsSync(candidate));
if (!compiler) {
  console.error('Compilateur C# introuvable (.NET Framework 4).');
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', '/platform:anycpu', `/out:${OUTPUT}`, SOURCE], { stdio: 'inherit' });
console.log(`${path.relative(ROOT, OUTPUT)} ${fs.statSync(OUTPUT).size} octets`);
