/* Pure scheduling logic for the Quiz tab — a 3-bucket Leitner scheduler.
   No DOM, no storage: everything here operates on plain term objects and a
   `progress` map ({ [id]: { bucket, seen, lastSeen } }), so it is unit-testable
   under node:test. Buckets: 0 Red (unfamiliar/unseen) · 1 Orange (shaky) ·
   2 Green (known). */

export const BUCKET = { RED: 0, ORANGE: 1, GREEN: 2 };
export const GRADES = ['again', 'effort', 'known'];

const GRADE_BUCKET = { again: BUCKET.RED, effort: BUCKET.ORANGE, known: BUCKET.GREEN };

/* Map a self-grade to the bucket it sets. Throws on an unknown grade so callers
   can't silently mis-schedule. */
export function gradeToBucket(grade) {
  if (!Object.prototype.hasOwnProperty.call(GRADE_BUCKET, grade)) {
    throw new Error('unknown grade: ' + grade);
  }
  return GRADE_BUCKET[grade];
}

/* The bucket a term currently sits in. An unseen term (no progress entry) is
   treated as RED so it sorts to the front of a fresh deck. */
export function effectiveBucket(progress, id) {
  const e = progress && progress[id];
  return e && typeof e.bucket === 'number' ? e.bucket : BUCKET.RED;
}

/* Category filter predicate. A null/empty filter matches every term. */
export function inCategories(term, categories) {
  return !categories || categories.length === 0 || categories.includes(term.category);
}

/* How many terms the user has graded as not-yet-known (bucket < GREEN). Drives
   the "Review unfamiliar (N)" affordance. Unseen terms are NOT counted — they
   are "new", not "to review". */
export function countUnfamiliar(progress) {
  return Object.values(progress || {}).filter((e) => e && e.bucket < BUCKET.GREEN).length;
}

/* Build an ordered deck of term ids: filter by category, then sort
   unfamiliar-first (lower bucket first), ties broken by source order. Pure and
   deterministic (no shuffle) so it is testable. */
export function buildDeck(terms, progress = {}, options = {}) {
  const cats = options.categories;
  return terms
    .filter((t) => inCategories(t, cats))
    .map((t, i) => ({ id: t.id, b: effectiveBucket(progress, t.id), i }))
    .sort((a, b) => a.b - b.b || a.i - b.i)
    .map((x) => x.id);
}

/* The "review" deck: only terms the user has already seen AND not yet mastered
   (an existing entry with bucket < GREEN), in source order, category-filtered. */
export function reviewableIds(terms, progress = {}, options = {}) {
  const cats = options.categories;
  return terms
    .filter((t) => inCategories(t, cats))
    .filter((t) => { const e = progress[t.id]; return e && e.bucket < BUCKET.GREEN; })
    .map((t) => t.id);
}

/* Within-session requeue after grading the front card (queue[0]):
     known  → drop it (mastered this sitting)
     effort → move it to the back of the pass
     again  → resurface it ~gap cards ahead (clamped to the end)
   Returns a NEW array; never mutates the input. */
export function applyGrade(queue, grade, gap = 4) {
  if (!queue.length) return [];
  const [current, ...rest] = queue;
  if (grade === 'known') return rest;
  if (grade === 'effort') return [...rest, current];
  const i = Math.min(gap, rest.length);
  return [...rest.slice(0, i), current, ...rest.slice(i)];
}
