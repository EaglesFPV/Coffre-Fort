'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { generate, estimate } = require('../src/core/passwords');

test('génère la longueur demandée avec chaque catégorie de caractères', () => {
  for (let i = 0; i < 300; i++) {
    const { password } = generate({ length: 12 });
    assert.equal(password.length, 12);
    assert.match(password, /[a-z]/);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[0-9]/);
    assert.match(password, /[^A-Za-z0-9]/);
  }
});

test('respecte les options du générateur', () => {
  assert.match(generate({ length: 10, lower: false, upper: false, symbols: false }).password, /^\d{10}$/);
  assert.doesNotMatch(generate({ length: 60, avoidAmbiguous: true }).password, /[Il1|O0o]/);
  assert.equal(generate({ length: 2 }).password.length, 8);
  assert.equal(generate({ length: 500 }).password.length, 128);
});

test('juge faibles les mots de passe prévisibles', () => {
  for (const weak of ['azerty', '123456789', 'Soleil2024!', 'aaaaaaaaaaaa', 'motdepasse1', 'qwertyuiop123']) {
    assert.ok(estimate(weak).score <= 1, weak);
  }
});

test('juge très forts les phrases de passe et mots de passe générés', () => {
  for (const strong of ['girafe tondeuse orbite sirop lampe', generate({ length: 20 }).password]) {
    assert.equal(estimate(strong).score, 4, strong);
  }
});
