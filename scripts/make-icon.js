'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const SIZE = 512;
const BUILD = path.join(__dirname, '..', 'build');
const OUTPUT = path.join(BUILD, 'icon.png');

const logo = fs.readFileSync(path.join(BUILD, 'logo-dark.svg'), 'utf8')
  .replace('width="512" height="512"', 'x="76" y="68" width="360" height="360"');

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#164b57"/>
      <stop offset="1" stop-color="#071f25"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#background)"/>
  <rect x="17" y="17" width="478" height="478" rx="111" fill="none" stroke="#4fd1b5" stroke-opacity="0.18" stroke-width="2"/>
  ${logo}
</svg>`;

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: SIZE, height: SIZE, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;background:transparent">${SVG}</body></html>`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const image = (await window.webContents.capturePage()).resize({ width: SIZE, height: SIZE, quality: 'best' });
  fs.writeFileSync(OUTPUT, image.toPNG());
  console.log(`${path.relative(process.cwd(), OUTPUT)} ${SIZE}x${SIZE}`);
  app.quit();
});
