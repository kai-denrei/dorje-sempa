import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUCKET, GRADES, gradeToBucket, effectiveBucket, inCategories,
  countUnfamiliar, buildDeck, reviewableIds, applyGrade,
} from '../src/quiz-scheduler.js';

const TERMS = [
  { id: 'a', category: 'foundation' },
  { id: 'b', category: 'practice' },
  { id: 'c', category: 'practice' },
  { id: 'd', category: 'lineage' },
];

test('GRADES are exactly the three grade ids', () => {
  assert.deepEqual(GRADES, ['again', 'effort', 'known']);
});

test('gradeToBucket maps each grade to its bucket', () => {
  assert.equal(gradeToBucket('again'), BUCKET.RED);
  assert.equal(gradeToBucket('effort'), BUCKET.ORANGE);
  assert.equal(gradeToBucket('known'), BUCKET.GREEN);
});

test('gradeToBucket throws on an unknown grade', () => {
  assert.throws(() => gradeToBucket('nope'));
});

test('effectiveBucket: unseen term is RED (0)', () => {
  assert.equal(effectiveBucket({}, 'a'), BUCKET.RED);
});

test('effectiveBucket: returns the stored bucket', () => {
  assert.equal(effectiveBucket({ a: { bucket: 2 } }, 'a'), BUCKET.GREEN);
});

test('inCategories: null/empty matches everything', () => {
  assert.equal(inCategories(TERMS[0], null), true);
  assert.equal(inCategories(TERMS[0], []), true);
});

test('inCategories: filters by category', () => {
  assert.equal(inCategories(TERMS[1], ['practice']), true);
  assert.equal(inCategories(TERMS[0], ['practice']), false);
});

test('countUnfamiliar counts entries with bucket < 2', () => {
  const progress = { a: { bucket: 0 }, b: { bucket: 1 }, c: { bucket: 2 } };
  assert.equal(countUnfamiliar(progress), 2);
});

test('buildDeck orders unfamiliar-first, then source order', () => {
  const progress = { a: { bucket: 2 }, b: { bucket: 1 } };
  // c,d unseen (0); b is 1; a is 2 → [c, d, b, a]
  assert.deepEqual(buildDeck(TERMS, progress), ['c', 'd', 'b', 'a']);
});

test('buildDeck filters by category', () => {
  assert.deepEqual(buildDeck(TERMS, {}, { categories: ['practice'] }), ['b', 'c']);
});

test('reviewableIds returns only seen terms with bucket < 2', () => {
  const progress = { a: { bucket: 0 }, b: { bucket: 2 }, c: { bucket: 1 } };
  // a (0) and c (1) are reviewable; b is mastered; d is unseen → not reviewable
  assert.deepEqual(reviewableIds(TERMS, progress), ['a', 'c']);
});

test('applyGrade known drops the current card', () => {
  assert.deepEqual(applyGrade(['a', 'b', 'c'], 'known'), ['b', 'c']);
});

test('applyGrade effort moves the current card to the back', () => {
  assert.deepEqual(applyGrade(['a', 'b', 'c'], 'effort'), ['b', 'c', 'a']);
});

test('applyGrade again reinserts the card ~gap ahead', () => {
  assert.deepEqual(applyGrade(['a', 'b', 'c', 'd', 'e'], 'again', 2), ['b', 'c', 'a', 'd', 'e']);
});

test('applyGrade again clamps to end when gap exceeds remaining', () => {
  assert.deepEqual(applyGrade(['a', 'b'], 'again', 4), ['b', 'a']);
});

test('applyGrade on a single-item queue: again keeps it, known empties it', () => {
  assert.deepEqual(applyGrade(['a'], 'again'), ['a']);
  assert.deepEqual(applyGrade(['a'], 'known'), []);
});
