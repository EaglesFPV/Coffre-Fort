'use strict';

const { estimate } = require('./passwords');

const OLD_AFTER_SECONDS = 365 * 24 * 60 * 60;

function analyze(entries, nowSeconds = Date.now() / 1000) {
  const logins = entries.filter((entry) => entry.type === 'login' && entry.password);
  const occurrences = new Map();
  for (const { password } of logins) occurrences.set(password, (occurrences.get(password) || 0) + 1);

  const perEntry = new Map();
  const summary = { total: logins.length, weak: 0, reused: 0, old: 0, safe: 0, score: null };

  for (const entry of logins) {
    const strength = estimate(entry.password);
    const reuseCount = occurrences.get(entry.password);
    const flags = {
      strength: strength.score,
      strengthLabel: strength.label,
      weak: strength.score <= 2,
      reused: reuseCount > 1,
      reuseCount,
      old: nowSeconds - entry.passwordModified > OLD_AFTER_SECONDS,
    };
    perEntry.set(entry.id, flags);
    summary.weak += flags.weak ? 1 : 0;
    summary.reused += flags.reused ? 1 : 0;
    summary.old += flags.old ? 1 : 0;
    summary.safe += !flags.weak && !flags.reused ? 1 : 0;
  }

  if (logins.length) summary.score = Math.round((100 * summary.safe) / logins.length);
  return { perEntry, summary };
}

module.exports = { analyze };
