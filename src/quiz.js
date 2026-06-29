/* Quiz tab — DOM + interaction. Turns the glossary into self-graded flip cards:
   front shows the term (Tibetan glyph + transliteration, or phonetic/Sanskrit for
   concept terms); the user recalls, reveals the gloss, and self-rates on a
   3-level scale that drives a Leitner scheduler (src/quiz-scheduler.js) persisted
   across visits (src/storage.js). Recall-first: grade buttons appear only after
   reveal. Calm tone: within-session "Remaining" + a persistent "know well" tally,
   no streaks/XP. */

import { loadTerms, allTerms, getTerm, glossHtml, hasTibetan } from './terms.js';
import { buildDeck, reviewableIds, applyGrade, gradeToBucket, countUnfamiliar } from './quiz-scheduler.js';
import { createQuizStore } from './storage.js';

const CATEGORIES = ['foundation', 'concept', 'practice', 'lineage', 'institution', 'script'];
const GRADE_BUTTONS = [
  { grade: 'again',  label: "Didn't come",   cls: 'q-again',  key: '1' },
  { grade: 'effort', label: 'Needed effort', cls: 'q-effort', key: '2' },
  { grade: 'known',  label: 'Knew it',       cls: 'q-known',  key: '3' },
];
const KEY_GRADE = { '1': 'again', '2': 'effort', '3': 'known' };

let mounted = false;
let store = null;
let panel = null;
let selectedCats = new Set();   // empty = all categories
let queue = [];
let revealed = false;
let tally = { reviewed: 0, again: 0, effort: 0, known: 0 };

/* Escape plain term fields for safe innerHTML interpolation (the gloss uses
   glossHtml() instead, which escapes then renders *bold* spans). */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function catsArray() { return selectedCats.size ? Array.from(selectedCats) : null; }

export async function mountQuiz(panelEl) {
  panel = panelEl || document.getElementById('panel-quiz');
  if (!panel) return;
  if (!mounted) {
    mounted = true;
    store = createQuizStore();
    try { await loadTerms(); } catch (_) { /* terms unavailable: render handles empty */ }
    store.load();
    panel.addEventListener('keydown', onKeydown);
  }
  renderStart();
}

function renderStart() {
  const progress = store.getProgress();
  const reviewN = countUnfamiliar(progress);
  const known = store.knownCount();
  const total = allTerms().length;

  panel.innerHTML = `
    <div class="quiz-start">
      <div class="section-head"><p class="eyebrow">Self-study</p><h2>Quiz</h2></div>
      <p class="prose">See a term, recall what it means, then reveal the answer and
        rate yourself. The ones you don't yet know come back for review.</p>
      <div class="quiz-filters" role="group" aria-label="Filter by category"></div>
      <div class="quiz-actions">
        ${reviewN > 0 ? `<button type="button" class="quiz-btn quiz-btn--primary" data-action="review">Review unfamiliar (${reviewN})</button>` : ''}
        <button type="button" class="quiz-btn" data-action="all">Start (<span data-count>${total}</span> terms)</button>
      </div>
      <p class="quiz-known" aria-live="polite">Terms you know well: <strong>${known}</strong> / ${total}</p>
    </div>`;

  const filters = panel.querySelector('.quiz-filters');
  CATEGORIES.forEach((cat) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quiz-chip';
    b.textContent = cat;
    b.setAttribute('aria-pressed', selectedCats.has(cat) ? 'true' : 'false');
    b.addEventListener('click', () => {
      if (selectedCats.has(cat)) selectedCats.delete(cat); else selectedCats.add(cat);
      b.setAttribute('aria-pressed', selectedCats.has(cat) ? 'true' : 'false');
      updateStartCount();
    });
    filters.appendChild(b);
  });

  panel.querySelector('[data-action="all"]').addEventListener('click', () => {
    startSession(buildDeck(allTerms(), store.getProgress(), { categories: catsArray() }));
  });
  const reviewBtn = panel.querySelector('[data-action="review"]');
  if (reviewBtn) {
    reviewBtn.addEventListener('click', () => {
      startSession(reviewableIds(allTerms(), store.getProgress(), { categories: catsArray() }));
    });
  }
}

function updateStartCount() {
  const ids = buildDeck(allTerms(), store.getProgress(), { categories: catsArray() });
  const c = panel.querySelector('[data-count]');
  if (c) c.textContent = ids.length;
}

function startSession(ids) {
  if (!ids.length) { renderEmpty(); return; }
  queue = ids.slice();
  tally = { reviewed: 0, again: 0, effort: 0, known: 0 };
  renderCard();
}

function frontHTML(t) {
  if (hasTibetan(t)) {
    return `
      <div class="tib-display" lang="bo">${esc(t.tibetan)}</div>
      <div class="quiz-translit">
        <span class="wylie">${esc(t.wylie)}</span>
        <span class="phonetic">${esc(t.phonetic)}</span>
      </div>
      <span class="quiz-cat">${esc(t.category)}</span>`;
  }
  const sk = t.sanskrit ? `<span class="sanskrit">${esc(t.sanskrit)}</span>` : '';
  return `
    <div class="quiz-head">${esc(t.phonetic)}</div>
    <div class="quiz-translit">${sk}<span class="wylie">${esc(t.wylie)}</span></div>
    <span class="quiz-cat">${esc(t.category)}</span>`;
}

function backMetaHTML(t) {
  const bits = [];
  if (hasTibetan(t)) bits.push(`<span class="phonetic">${esc(t.phonetic)}</span>`);
  if (t.sanskrit) bits.push(`<span class="sanskrit">${esc(t.sanskrit)}</span>`);
  return bits.length ? `<div class="quiz-back-meta">${bits.join('')}</div>` : '';
}

function renderCard() {
  if (!queue.length) { renderSummary(); return; }
  const t = getTerm(queue[0]);
  if (!t) { queue.shift(); renderCard(); return; }
  revealed = false;

  panel.innerHTML = `
    <div class="quiz-session">
      <p class="quiz-progress" aria-live="polite">Remaining: <strong>${queue.length}</strong></p>
      <div class="quiz-card">
        <div class="quiz-face quiz-front">${frontHTML(t)}</div>
        <div class="quiz-face quiz-back" hidden>
          <p class="quiz-gloss">${glossHtml(t.gloss)}</p>
          ${backMetaHTML(t)}
        </div>
      </div>
      <div class="quiz-controls">
        <button type="button" class="quiz-btn quiz-btn--primary" data-action="reveal">Reveal</button>
        <div class="quiz-grades" role="group" aria-label="Rate your recall" hidden>
          ${GRADE_BUTTONS.map((g) =>
            `<button type="button" class="quiz-grade ${g.cls}" data-grade="${g.grade}"><span class="quiz-grade-key" aria-hidden="true">${g.key}</span> ${g.label}</button>`
          ).join('')}
        </div>
      </div>
      <button type="button" class="quiz-quit" data-action="quit">End session</button>
    </div>`;

  panel.querySelector('[data-action="reveal"]').addEventListener('click', reveal);
  panel.querySelectorAll('[data-grade]').forEach((b) =>
    b.addEventListener('click', () => grade(b.dataset.grade)));
  panel.querySelector('[data-action="quit"]').addEventListener('click', renderStart);
}

function reveal() {
  if (revealed) return;
  revealed = true;
  panel.querySelector('.quiz-back').hidden = false;
  panel.querySelector('[data-action="reveal"]').hidden = true;
  const grades = panel.querySelector('.quiz-grades');
  grades.hidden = false;
  const first = grades.querySelector('button');
  if (first) first.focus();   // move focus to the answer (SR announces, keyboard lands here)
}

function grade(g) {
  if (!revealed) return;
  const id = queue[0];
  store.recordGrade(id, gradeToBucket(g), Date.now());
  tally.reviewed += 1;
  tally[g] += 1;
  queue = applyGrade(queue, g);
  renderCard();
}

function renderSummary() {
  const known = store.knownCount();
  const total = allTerms().length;
  const missed = tally.effort + tally.again;
  panel.innerHTML = `
    <div class="quiz-summary">
      <div class="section-head"><p class="eyebrow">Session complete</p><h2>Well done</h2></div>
      <p class="prose">Reviewed <strong>${tally.reviewed}</strong> ·
        knew <strong>${tally.known}</strong> ·
        needed effort <strong>${tally.effort}</strong> ·
        didn't come <strong>${tally.again}</strong>.</p>
      <p class="quiz-known">Terms you know well: <strong>${known}</strong> / ${total}</p>
      <div class="quiz-actions">
        ${missed > 0 ? `<button type="button" class="quiz-btn quiz-btn--primary" data-action="review-again">Review the ${missed} you missed</button>` : ''}
        <button type="button" class="quiz-btn" data-action="home">Back to start</button>
      </div>
    </div>`;
  panel.querySelector('[data-action="home"]').addEventListener('click', renderStart);
  const ra = panel.querySelector('[data-action="review-again"]');
  if (ra) {
    ra.addEventListener('click', () => {
      startSession(reviewableIds(allTerms(), store.getProgress(), { categories: catsArray() }));
    });
  }
}

function renderEmpty() {
  panel.innerHTML = `
    <div class="quiz-start">
      <div class="section-head"><h2>Nothing to review</h2></div>
      <p class="prose">No terms match this selection. Adjust the filters, or start the full deck.</p>
      <div class="quiz-actions"><button type="button" class="quiz-btn" data-action="home">Back</button></div>
    </div>`;
  panel.querySelector('[data-action="home"]').addEventListener('click', renderStart);
}

function onKeydown(e) {
  if (!panel.querySelector('.quiz-session')) return;   // only during a session
  if (!revealed) {
    const onRevealBtn = document.activeElement
      && document.activeElement.dataset
      && document.activeElement.dataset.action === 'reveal';
    if (!onRevealBtn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); reveal(); }
    return;
  }
  if (KEY_GRADE[e.key]) { e.preventDefault(); grade(KEY_GRADE[e.key]); }
}
