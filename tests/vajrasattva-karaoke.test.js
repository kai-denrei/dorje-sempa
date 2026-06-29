import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANTRA, flattenTokens, countRemaining } from '../src/vajrasattva-karaoke.js';

// Running token totals per phrase, transcribed from HANDOVER §3 (pre-verified).
const PHRASE_CUMULATIVE = [1, 5, 13, 17, 22, 27, 33, 39, 46, 54, 61, 67, 68, 73, 76, 82, 88, 92, 99, 100];

test('there are 20 phrases, each carrying an English gloss', () => {
  assert.equal(MANTRA.length, 20);
  for (const ph of MANTRA) assert.ok(typeof ph.en === 'string' && ph.en.length > 0);
});

test('flattenTokens yields exactly 100 colorable units (acceptance check #1)', () => {
  const { tokens } = flattenTokens(MANTRA);
  assert.equal(tokens.length, 100);
});

test('total beats are 102 (the two KAYO each held 2 beats)', () => {
  const { totalBeats } = flattenTokens(MANTRA);
  assert.equal(totalBeats, 102);
});

test('exactly two KAYO tokens, each spanning 2 beats', () => {
  const { tokens } = flattenTokens(MANTRA);
  const kayo = tokens.filter((t) => t.text === 'KAYO');
  assert.equal(kayo.length, 2);
  for (const k of kayo) assert.equal(k.dur, 2);
});

test('token start/end are contiguous and monotonic', () => {
  const { tokens } = flattenTokens(MANTRA);
  let cursor = 0;
  for (const t of tokens) {
    assert.equal(t.start, cursor);
    assert.equal(t.end, cursor + t.dur);
    cursor = t.end;
  }
});

test('cumulative token count at each phrase boundary matches the handover table', () => {
  const { tokens } = flattenTokens(MANTRA);
  const cum = [];
  let n = 0, phrase = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].phrase !== phrase) { cum.push(n); phrase = tokens[i].phrase; }
    n++;
  }
  cum.push(n); // final phrase
  assert.deepEqual(cum, PHRASE_CUMULATIVE);
});

test('countRemaining starts at 100, lands on 0, decrements one per syllable', () => {
  const { tokens, totalBeats } = flattenTokens(MANTRA);
  assert.equal(countRemaining(tokens, 0), 100);
  assert.equal(countRemaining(tokens, totalBeats), 0);
  // first token (OM) ends at beat 1 → one completed → 99 remaining
  assert.equal(countRemaining(tokens, 1), 99);
  // at beat 5: OM + BENZA·SATO = 5 units completed → 95 remaining
  assert.equal(countRemaining(tokens, 5), 95);
});
