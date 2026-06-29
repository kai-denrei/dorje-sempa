import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, SCHEMA_VERSION, memoryBackend, createQuizStore,
} from '../src/storage.js';

const FIXED = () => 1000;

test('a fresh store has empty progress', () => {
  const store = createQuizStore(memoryBackend(), FIXED);
  assert.deepEqual(store.getProgress(), {});
  assert.equal(store.knownCount(), 0);
});

test('recordGrade writes an entry and increments seen', () => {
  const store = createQuizStore(memoryBackend(), FIXED);
  const e1 = store.recordGrade('phowa', 0);
  assert.deepEqual(e1, { bucket: 0, seen: 1, lastSeen: 1000 });
  const e2 = store.recordGrade('phowa', 2);
  assert.deepEqual(e2, { bucket: 2, seen: 2, lastSeen: 1000 });
});

test('knownCount counts only bucket === 2', () => {
  const store = createQuizStore(memoryBackend(), FIXED);
  store.recordGrade('a', 2);
  store.recordGrade('b', 1);
  store.recordGrade('c', 2);
  assert.equal(store.knownCount(), 2);
});

test('progress persists through the backend across store instances', () => {
  const backend = memoryBackend();
  const s1 = createQuizStore(backend, FIXED);
  s1.recordGrade('kagyu', 2);
  const s2 = createQuizStore(backend, FIXED);
  assert.deepEqual(s2.getProgress(), { kagyu: { bucket: 2, seen: 1, lastSeen: 1000 } });
});

test('stored blob is versioned', () => {
  const backend = memoryBackend();
  const store = createQuizStore(backend, FIXED);
  store.recordGrade('a', 1);
  const raw = JSON.parse(backend.getItem(STORAGE_KEY));
  assert.equal(raw.v, SCHEMA_VERSION);
  assert.ok(raw.terms.a);
});

test('a wrong-version blob is ignored (returns empty)', () => {
  const backend = memoryBackend();
  backend.setItem(STORAGE_KEY, JSON.stringify({ v: 999, terms: { a: { bucket: 2 } } }));
  const store = createQuizStore(backend, FIXED);
  assert.deepEqual(store.getProgress(), {});
});

test('a corrupt blob is ignored (returns empty, does not throw)', () => {
  const backend = memoryBackend();
  backend.setItem(STORAGE_KEY, 'not json {{{');
  const store = createQuizStore(backend, FIXED);
  assert.deepEqual(store.getProgress(), {});
});

test('reset clears progress', () => {
  const store = createQuizStore(memoryBackend(), FIXED);
  store.recordGrade('a', 2);
  store.reset();
  assert.deepEqual(store.getProgress(), {});
});

test('a throwing backend degrades gracefully (in-memory, no throw)', () => {
  const throwing = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() {},
  };
  const store = createQuizStore(throwing, FIXED);
  assert.deepEqual(store.getProgress(), {});
  // recordGrade must not throw even though setItem throws
  const e = store.recordGrade('a', 1);
  assert.deepEqual(e, { bucket: 1, seen: 1, lastSeen: 1000 });
  assert.equal(store.getProgress().a.bucket, 1);
});
