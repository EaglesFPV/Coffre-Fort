'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { analyze } = require('../src/core/health');

test('repère les mots de passe réutilisés, faibles et anciens', () => {
  const now = Math.floor(Date.now() / 1000);
  const login = { type: 'login', passwordModified: now };
  const { perEntry, summary } = analyze([
    { ...login, id: 'a', password: 'X9#kq!2Lm@7vZp$4' },
    { ...login, id: 'b', password: 'X9#kq!2Lm@7vZp$4' },
    { ...login, id: 'c', password: 'azerty' },
    { ...login, id: 'd', password: 'T7^wq9!Bz#4Lm2@x', passwordModified: now - 400 * 86400 },
    { type: 'note', id: 'e', password: '', passwordModified: now },
  ], now);

  assert.deepEqual(summary, { total: 4, weak: 1, reused: 2, old: 1, safe: 1, score: 25 });
  assert.equal(perEntry.get('a').reuseCount, 2);
  assert.equal(perEntry.get('c').weak, true);
  assert.equal(perEntry.get('d').old, true);
  assert.equal(perEntry.has('e'), false);
});

test("ne donne pas de score quand il n'y a rien à analyser", () => {
  assert.equal(analyze([]).summary.score, null);
});
