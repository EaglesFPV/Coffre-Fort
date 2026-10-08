'use strict';

const SHARED_SUFFIXES = new Set([
  'github.io', 'gitlab.io', 'pages.dev', 'workers.dev', 'vercel.app', 'netlify.app', 'web.app', 'firebaseapp.com',
  'herokuapp.com', 'azurewebsites.net', 'cloudfront.net', 'amazonaws.com', 'appspot.com', 'blogspot.com',
  'wordpress.com', 'wixsite.com', 'glitch.me', 'repl.co', 'ngrok.io', 'ngrok-free.app', 'onrender.com', 'fly.dev',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'co.jp', 'com.br', 'co.nz', 'co.za', 'com.mx', 'com.tr',
  'gouv.fr', 'asso.fr', 'com.fr',
]);

function parse(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  try {
    const url = new URL(candidate);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) return null;
    return { protocol: url.protocol, host: url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '') };
  } catch {
    return null;
  }
}

function hostOf(raw) {
  return parse(raw)?.host ?? '';
}

function isLocalHost(host) {
  return host === 'localhost' || host === '[::1]' || /^127(\.\d{1,3}){3}$/.test(host);
}

function allowsSubdomains(host) {
  const isIpAddress = /^[\d.]+$/.test(host) || host.startsWith('[');
  return host.includes('.') && !isIpAddress && !SHARED_SUFFIXES.has(host);
}

function hostMatches(entryHost, pageHost) {
  if (!entryHost || !pageHost) return false;
  if (entryHost === pageHost) return true;
  return allowsSubdomains(entryHost) && pageHost.endsWith(`.${entryHost}`);
}

function matches(entryUrl, pageUrl) {
  const entry = parse(entryUrl);
  const page = parse(pageUrl);
  if (!entry || !page || !hostMatches(entry.host, page.host)) return false;
  if (page.protocol === 'https:' || isLocalHost(page.host)) return true;
  return /^http:\/\//i.test(String(entryUrl).trim());
}

function isSecurePage(pageUrl) {
  const page = parse(pageUrl);
  return Boolean(page) && (page.protocol === 'https:' || isLocalHost(page.host));
}

module.exports = { hostOf, matches, isSecurePage };
