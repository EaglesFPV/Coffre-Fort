'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { app, protocol, session } = require('electron');
const config = require('./config');

const UPDATER_PARTITION = 'electron-updater';

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
});

const UPDATE_HOSTS = [/^github\.com$/, /^api\.github\.com$/, /(^|\.)githubusercontent\.com$/];

function isUpdateUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && UPDATE_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

function isRendererUrl(raw) {
  return raw.startsWith(`${config.origin}/`) || (config.isDev && raw.startsWith('devtools://'));
}

function denyAllPermissions(target) {
  target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  target.setPermissionCheckHandler(() => false);
}

function hardenDefaultSession() {
  const target = session.defaultSession;
  denyAllPermissions(target);
  target.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isRendererUrl(details.url) });
  });
}

function hardenUpdaterSession() {
  const target = session.fromPartition(UPDATER_PARTITION, { cache: false });
  denyAllPermissions(target);
  target.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isUpdateUrl(details.url) });
  });
}

function serveRenderer() {
  const root = path.normalize(config.rendererDir) + path.sep;
  protocol.handle(config.scheme, async (request) => {
    const url = new URL(request.url);
    const file = path.normalize(path.join(config.rendererDir, decodeURIComponent(url.pathname)));
    const type = MIME_TYPES[path.extname(file)];
    if (url.host !== config.host || !file.startsWith(root) || !type) {
      return new Response('Not found', { status: 404 });
    }
    try {
      return new Response(await fs.readFile(file), {
        headers: {
          'content-type': type,
          'content-security-policy': CONTENT_SECURITY_POLICY,
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-store',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function lockDownWebContents() {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.on('will-redirect', (event) => event.preventDefault());
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}

function beforeReady() {
  app.enableSandbox();
  protocol.registerSchemesAsPrivileged([
    { scheme: config.scheme, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
  lockDownWebContents();
}

function afterReady() {
  hardenDefaultSession();
  hardenUpdaterSession();
  serveRenderer();
}

function isTrustedSender(frame) {
  return Boolean(frame) && frame.url === config.entryUrl;
}

module.exports = { beforeReady, afterReady, isTrustedSender, isUpdateUrl };
