'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { hostOf, matches, isSecurePage } = require('../src/core/url-match');

test('reconnaît le site enregistré et ses sous-domaines', () => {
  assert.equal(matches('google.com', 'https://google.com/login'), true);
  assert.equal(matches('google.com', 'https://accounts.google.com/signin?x=1'), true);
  assert.equal(matches('https://www.amazon.fr/ap/signin', 'https://amazon.fr'), true);
  assert.equal(matches('amazon.fr', 'https://www.amazon.fr/'), true);
  assert.equal(matches('BANQUE.fr', 'https://Banque.FR/'), true);
  assert.equal(matches('exemple.fr:8443', 'https://exemple.fr/'), true);
});

test('refuse les sites qui imitent le vrai', () => {
  for (const fake of [
    'https://google.com.evil.io/',
    'https://notgoogle.com/',
    'https://google.co/',
    'https://evil.io/?next=google.com',
    'https://evil.io/google.com',
    'https://google.com@evil.io/',
    'https://xn--ggle-55da.com/',
    'https://gοogle.com/',
  ]) {
    assert.equal(matches('google.com', fake), false, fake);
  }
});

test("ne remonte pas d'un sous-domaine vers le domaine parent", () => {
  assert.equal(matches('accounts.google.com', 'https://google.com/'), false);
  assert.equal(matches('accounts.google.com', 'https://mail.google.com/'), false);
});

test('exige une correspondance exacte sur les hébergements partagés', () => {
  assert.equal(matches('github.io', 'https://pirate.github.io/'), false);
  assert.equal(matches('moi.github.io', 'https://moi.github.io/'), true);
  assert.equal(matches('moi.github.io', 'https://pirate.github.io/'), false);
  assert.equal(matches('co.uk', 'https://banque.co.uk/'), false);
  assert.equal(matches('com', 'https://exemple.com/'), false);
  assert.equal(matches('192.168.1.1', 'https://5.192.168.1.1/'), false);
});

test('refuse les pages non sécurisées sauf si le compte est lui-même en http', () => {
  assert.equal(matches('exemple.fr', 'http://exemple.fr/'), false);
  assert.equal(matches('https://exemple.fr', 'http://exemple.fr/'), false);
  assert.equal(matches('http://routeur.maison.fr', 'http://routeur.maison.fr/'), true);
  assert.equal(matches('localhost:3000', 'http://localhost:3000/'), true);
  assert.equal(isSecurePage('https://exemple.fr'), true);
  assert.equal(isSecurePage('http://exemple.fr'), false);
  assert.equal(isSecurePage('http://127.0.0.1:8080'), true);
});

test('ignore les adresses vides, invalides ou non web', () => {
  assert.equal(matches('', 'https://exemple.fr'), false);
  assert.equal(matches('exemple.fr', ''), false);
  assert.equal(matches('exemple.fr', 'chrome://settings'), false);
  assert.equal(matches('exemple.fr', 'file:///C:/exemple.fr'), false);
  assert.equal(matches('javascript:alert(1)', 'https://exemple.fr'), false);
  assert.equal(hostOf('https://www.Exemple.fr/chemin'), 'exemple.fr');
  assert.equal(hostOf('pas une adresse'), '');
});
