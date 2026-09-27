'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const SIZE = 512;
const OUTPUT = path.join(__dirname, '..', 'build', 'icon.png');

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5fe0c3"/>
      <stop offset="1" stop-color="#0e7c6d"/>
    </linearGradient>
    <linearGradient id="shield" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f3a44"/>
      <stop offset="1" stop-color="#071f25"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#background)"/>
  <path d="M256 92 L380 138 V250 C380 338 318 392 256 420 C194 392 132 338 132 250 V138 Z" fill="url(#shield)"/>
  <rect x="206" y="236" width="100" height="84" rx="16" fill="#5fe0c3"/>
  <path d="M226 236 V212 a30 30 0 0 1 60 0 V236" fill="none" stroke="#5fe0c3" stroke-width="18" stroke-linecap="round"/>
  <circle cx="256" cy="272" r="11" fill="#071f25"/>
  <rect x="251" y="276" width="10" height="24" rx="5" fill="#071f25"/>
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
