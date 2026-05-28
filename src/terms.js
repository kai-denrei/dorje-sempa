/* Shared term store + the site-wide term-card popover (handover §5.3).
   - Loads /data/glossary.json once (cache:'no-store' so edits show on reload).
   - Term-card popover on hover AND tap/focus for any [data-term] element:
     large glyph · Wylie · phonetic · gloss · tsheg-split colored syllable chips.
   The former Tibetan⇄phonetic script-mode toggle was removed: inline glyphs read
   as authored (the prose carries phonetics where needed, and the popover shows
   the phonetic on hover/focus), and the glossary always shows the phonetic
   alongside the Tibetan. This module is imported by the homepage and the
   glossary route. */

const TSHEG = '་';            // ་  intersyllabic tsheg (the syllable separator)

let TERMS = new Map();             // id -> term object
let loaded = null;                 // promise guard

export async function loadTerms() {
  if (loaded) return loaded;
  loaded = (async () => {
    const res = await fetch('/data/glossary.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('glossary.json HTTP ' + res.status);
    const data = await res.json();
    (data.terms || []).forEach((t) => TERMS.set(t.id, t));
    return TERMS;
  })();
  return loaded;
}

export function getTerm(id) { return TERMS.get(id); }
export function allTerms() { return Array.from(TERMS.values()); }

/* ---------- Search ---------- */
/* Build the searchable haystack for a term: phonetic + wylie + sanskrit + gloss
   + category + keywords, lowercased. Strip our bold-marking asterisks so the
   `*precious human life*` convention never leaks into matches. */
export function termHaystack(t) {
  return [t.phonetic, t.wylie, t.sanskrit, t.gloss, t.category, t.keywords]
    .filter(Boolean)
    .join(' ')
    .replace(/\*/g, '')
    .toLowerCase();
}

/* Split a string into bare word tokens (letters/digits across scripts). */
function tokenize(s) {
  return (s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

/* Does a precomputed haystack-token list match every query token? A query token
   matches if SOME haystack token is a bidirectional prefix or substring of it —
   so "turning" matches the word "turn" (and vice-versa), and multi-word queries
   require every query token to land somewhere. The `q.startsWith(h)` direction is
   gated to haystack tokens of length >= 3 so tiny words (e.g. "ma" from "bla ma")
   don't swallow longer queries like "mahamudra". */
export function haystackMatches(haystackTokens, queryTokens) {
  return queryTokens.every((q) =>
    haystackTokens.some((h) => h.startsWith(q) || (h.length >= 3 && q.startsWith(h)) || h.includes(q))
  );
}

/* Convenience: precompute a term's haystack tokens once for repeated queries. */
export function termSearchTokens(t) {
  return tokenize(termHaystack(t));
}

/* One-shot query helper (used where a precomputed token list isn't kept). */
export function termMatchesQuery(haystackTokens, query) {
  const qt = tokenize(query);
  if (!qt.length) return true;
  return haystackMatches(haystackTokens, qt);
}

export { tokenize };

/* ---------- Safe gloss rendering ---------- */
/* Glosses may carry *single-asterisk* bold spans (the bold-member convention).
   Escape ALL HTML first (XSS-safe), THEN turn the one markup we allow,
   *…* → <strong>…</strong>. Returns an HTML string for innerHTML. */
export function glossHtml(gloss) {
  return escapeHtml(gloss || '').replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
}

/* Assign a gloss (with *bold* spans rendered) onto an element, safely. */
export function setGloss(node, gloss) {
  node.innerHTML = glossHtml(gloss);
}

/* Split a Tibetan run on the tsheg into bare syllables (drop the trailing empty). */
export function splitSyllables(tibetan) {
  return (tibetan || '').split(TSHEG).map((s) => s.trim()).filter(Boolean);
}

/* Does this term carry a Tibetan-script headword? Beginner concept terms
   (Sanskrit/English primary) have an empty `tibetan` and lead with the
   phonetic headword instead — no glyph, no syllable chips, no verify badge. */
export function hasTibetan(t) {
  return !!(t && t.tibetan && t.tibetan.trim());
}

/* ---------- Term-card popover ---------- */
let popover = null;
let activeAnchor = null;

function buildPopover() {
  if (popover) return popover;
  popover = document.createElement('div');
  popover.className = 'term-popover';
  popover.setAttribute('role', 'dialog');
  popover.hidden = true;
  document.body.appendChild(popover);
  return popover;
}

function fillPopover(t) {
  const pop = buildPopover();
  if (hasTibetan(t)) {
    const chips = splitSyllables(t.tibetan)
      .map((s, i) => `<span class="syllable c${i % 5}" lang="bo">${escapeHtml(s)}</span>`)
      .join('');
    pop.className = 'term-popover';
    pop.innerHTML = `
      <div class="tp-tib" lang="bo">${escapeHtml(t.tibetan)}</div>
      <div class="tp-meta">
        <span class="phonetic">${escapeHtml(t.phonetic)}</span>
        <span class="wylie">${escapeHtml(t.wylie)}</span>
      </div>
      <p class="tp-gloss">${glossHtml(t.gloss)}</p>
      <div class="syllables" aria-label="Syllable breakdown">${chips}</div>
      ${t.tibetanVerified ? '' : '<p class="tp-flag">Tibetan unverified — Wylie is authoritative.</p>'}
      <a class="tp-link" href="/glossary/#${t.id}">Open in the glossary &rarr;</a>`;
  } else {
    // Concept card: headword large in the Latin display face, Sanskrit (IAST,
    // italic) if present, then the gloss. No glyph, no chips, no verify flag.
    const meta = [];
    if (t.sanskrit) meta.push(`<span class="sanskrit">${escapeHtml(t.sanskrit)}</span>`);
    if (t.wylie) meta.push(`<span class="wylie">${escapeHtml(t.wylie)}</span>`);
    pop.className = 'term-popover term-popover--concept';
    pop.innerHTML = `
      <div class="tp-head">${escapeHtml(t.phonetic)}</div>
      ${meta.length ? `<div class="tp-meta">${meta.join('')}</div>` : ''}
      <p class="tp-gloss">${glossHtml(t.gloss)}</p>
      <a class="tp-link" href="/glossary/#${t.id}">Open in the glossary &rarr;</a>`;
  }
}

function positionPopover(anchor) {
  const pop = buildPopover();
  const r = anchor.getBoundingClientRect();
  pop.hidden = false;                       // measure after it has size
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = r.left + window.scrollX + r.width / 2 - pw / 2;
  left = Math.max(8 + window.scrollX, Math.min(left, window.scrollX + document.documentElement.clientWidth - pw - 8));
  let top = r.top + window.scrollY - ph - 10;
  if (top < window.scrollY + 8) top = r.bottom + window.scrollY + 10; // flip below if no room
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}

function showCard(anchor) {
  const t = TERMS.get(anchor.dataset.term);
  if (!t) return;
  activeAnchor = anchor;
  fillPopover(t);
  positionPopover(anchor);
}
function hideCard() {
  if (popover) popover.hidden = true;
  activeAnchor = null;
}

/* Make every inline [data-term] reachable by keyboard and announced sensibly.
   Glossary card glyphs already set their own tabindex/role/label, so skip those. */
function enhanceTermAnchors() {
  document.querySelectorAll('[data-term]').forEach((node) => {
    // glossary card triggers (Tibetan glyph .tib / concept headword .head) are
    // already wired with their own tabindex/role/label — skip them here.
    if (node.classList.contains('tib') || node.classList.contains('head')) return;
    const t = TERMS.get(node.dataset.term);
    if (!t) return;
    if (!node.hasAttribute('tabindex')) node.tabIndex = 0;
    if (!node.hasAttribute('role')) node.setAttribute('role', 'button');
    const rom = t.wylie || t.sanskrit;
    const label = rom ? t.phonetic + ' (' + rom + ')' : t.phonetic;
    const plainGloss = (t.gloss || '').replace(/\*/g, '');
    // Respect a meaningful aria-label set by the caller (e.g. concept-map nodes,
    // which are deep links into the glossary and describe that action). Only
    // supply the default "Show term card." label when none is present.
    if (!node.hasAttribute('aria-label')) {
      node.setAttribute('aria-label', label + ' — ' + plainGloss + '. Show term card.');
    }
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showCard(node); }
    });
  });
}

/* Wire hover + focus + tap. Delegated so it covers terms added later. */
export function mountTermCards() {
  buildPopover();
  enhanceTermAnchors();
  document.addEventListener('mouseover', (e) => {
    const a = e.target.closest('[data-term]');
    if (a) showCard(a);
  });
  document.addEventListener('mouseout', (e) => {
    const a = e.target.closest('[data-term]');
    if (a && !popover.contains(e.relatedTarget)) hideCard();
  });
  document.addEventListener('focusin', (e) => {
    const a = e.target.closest('[data-term]');
    if (a) showCard(a);
  });
  document.addEventListener('focusout', (e) => {
    const a = e.target.closest('[data-term]');
    if (a && !popover.contains(e.relatedTarget)) hideCard();
  });
  // Tap: toggle on touch / click for keyboard-and-touch users.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-term]');
    if (a) {
      e.preventDefault();
      if (activeAnchor === a) hideCard(); else showCard(a);
    } else if (popover && !popover.contains(e.target)) {
      hideCard();
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCard(); });
  window.addEventListener('scroll', () => { if (activeAnchor) positionPopover(activeAnchor); }, { passive: true });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
