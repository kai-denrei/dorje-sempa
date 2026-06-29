import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YIGGYA, RECITATIONS, flattenTokens, countRemaining } from '../src/vajrasattva-recitation.js';

// Handover §10 acceptance: expected colorable-unit count per recitation.
const EXPECTED_UNITS = {
  vajrasattva: 100, mani: 6, vajraguru: 12, tara: 10, heart: 17, medicine: 23, mahakala: 8,
};

test('flattenTokens supports plain strings and [text, beats] pairs', () => {
  const { tokens, totalBeats } = flattenTokens([
    { en: 'x', words: [['A'], [['B', 2]], ['C']] },
  ]);
  assert.equal(tokens.length, 3);                 // 3 colorable units
  assert.equal(totalBeats, 4);                    // 1 + 2 + 1
  assert.deepEqual(tokens.map((t) => t.dur), [1, 2, 1]);
  assert.deepEqual(tokens.map((t) => t.text), ['A', 'B', 'C']);
});

test('yig-gya is still 100 units and 102 beats (KAYO now [text, 2])', () => {
  const { tokens, totalBeats } = flattenTokens(YIGGYA);
  assert.equal(tokens.length, 100);
  assert.equal(totalBeats, 102);
  const kayo = tokens.filter((t) => t.text === 'KAYO');
  assert.equal(kayo.length, 2);
  for (const k of kayo) assert.equal(k.dur, 2);
});

test('RECITATIONS has 7 entries with key/name/data/beatMs', () => {
  assert.equal(RECITATIONS.length, 7);
  for (const r of RECITATIONS) {
    assert.ok(r.key && r.name && Array.isArray(r.data) && typeof r.beatMs === 'number');
  }
});

test('each recitation flattens to its expected unit count', () => {
  for (const r of RECITATIONS) {
    const { tokens } = flattenTokens(r.data);
    assert.equal(tokens.length, EXPECTED_UNITS[r.key], `${r.key} unit count`);
  }
});

test('token start/end are contiguous for every recitation', () => {
  for (const r of RECITATIONS) {
    const { tokens } = flattenTokens(r.data);
    let cursor = 0;
    for (const t of tokens) { assert.equal(t.start, cursor); assert.equal(t.end, cursor + t.dur); cursor = t.end; }
  }
});

test('only Mahākāla carries a restriction note', () => {
  const withNote = RECITATIONS.filter((r) => r.note);
  assert.equal(withNote.length, 1);
  assert.equal(withNote[0].key, 'mahakala');
  assert.match(withNote[0].note, /empowerment/i);
});

test('countRemaining starts full, lands on 0 (per recitation)', () => {
  for (const r of RECITATIONS) {
    const { tokens, totalBeats } = flattenTokens(r.data);
    assert.equal(countRemaining(tokens, 0), tokens.length);
    assert.equal(countRemaining(tokens, totalBeats), 0);
    assert.equal(countRemaining(tokens, tokens[0].end), tokens.length - 1);
  }
});
