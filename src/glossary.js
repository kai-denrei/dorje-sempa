/* Glossary / Script Explorer (handover §5.3) — the typographic showpiece.
   Builds on the shared terms store: a museum-object grid (Tibetan large as the
   primary face, always shown with its phonetic + Wylie) with text + category
   filtering, tsheg-split colored syllable chips on every card, the term-card
   popover, and deep-linking (/glossary/#term-id scrolls to and highlights an
   entry). When a query is active the matching cards are ranked: name/phonetic
   (or Wylie) matches first, then keyword/category, then gloss-only. */

import { loadTerms, allTerms, splitSyllables, hasTibetan, mountTermCards,
         termSearchTokens, haystackMatches, tokenize, setGloss } from './terms.js';

function el(tag, opts = {}) {
  const n = document.createElement(tag);
  if (opts.class) n.className = opts.class;
  if (opts.text != null) n.textContent = opts.text;
  if (opts.lang) n.lang = opts.lang;
  return n;
}

function gloss(t) {
  const span = el('span', { class: 'gloss' });
  setGloss(span, t.gloss);     // *bold* spans rendered safely (escape → <strong>)
  return span;
}

function card(t) {
  const li = el('li', { class: 'term-card' });
  li.id = t.id;
  li.dataset.category = t.category;
  // Precompute the tokenized haystack once (phonetic+wylie+sanskrit+gloss+
  // category+keywords) and stash it on the node for fast repeated queries.
  li._searchTokens = termSearchTokens(t);
  // Field-scoped token lists for ranking a live query: a name match (phonetic
  // or Wylie) outranks a keyword/category/sanskrit match, which outranks a
  // gloss-only match. (Matching itself still uses the full haystack above.)
  li._nameTokens = tokenize([t.phonetic, t.wylie].filter(Boolean).join(' '));
  li._tagTokens = tokenize([t.keywords, t.category, t.sanskrit].filter(Boolean).join(' '));

  const tib = hasTibetan(t);
  li.dataset.unverified = (tib && !t.tibetanVerified).toString();
  li.dataset.concept = (!tib).toString();

  // Verification badge — only meaningful for terms that carry a Tibetan headword.
  // Sanskrit/English concept terms have no Tibetan to verify, so we omit the badge.
  if (tib) {
    li.append(el('span', {
      class: 'verify ' + (t.tibetanVerified ? 'ok' : 'unverified'),
      text: t.tibetanVerified ? 'verified' : 'unverified',
    }));
  }
  li.append(el('span', { class: 'cat', text: t.category }));

  if (tib) {
    // The large Tibetan glyph doubles as a term-card popover trigger.
    const glyph = el('span', { class: 'tib', lang: 'bo', text: t.tibetan });
    glyph.tabIndex = 0;
    glyph.dataset.term = t.id;
    glyph.setAttribute('role', 'button');
    glyph.setAttribute('aria-label', t.phonetic + ' — term card');
    li.append(glyph);

    li.append(el('span', { class: 'phonetic', text: t.phonetic }));
    li.append(el('span', { class: 'wylie', text: t.wylie }));
    li.append(gloss(t));

    // tsheg-split colored syllable chips (the museum-object breakdown)
    const syl = el('div', { class: 'syllables' });
    syl.setAttribute('aria-hidden', 'true');
    splitSyllables(t.tibetan).forEach((s, i) =>
      syl.appendChild(el('span', { class: 'syllable c' + (i % 5), lang: 'bo', text: s }))
    );
    li.append(syl);
  } else {
    // Concept card (Sanskrit / English primary): lead with the headword in the
    // Latin display face, then the Sanskrit (IAST, italic) if present, then gloss.
    const head = el('span', { class: 'head', text: t.phonetic });
    head.tabIndex = 0;
    head.dataset.term = t.id;
    head.setAttribute('role', 'button');
    head.setAttribute('aria-label', t.phonetic + ' — term card');
    li.append(head);

    if (t.sanskrit) li.append(el('span', { class: 'sanskrit', text: t.sanskrit }));
    if (t.wylie) li.append(el('span', { class: 'wylie', text: t.wylie }));
    li.append(gloss(t));
  }

  return li;
}

function highlightFromHash(grid) {
  const id = decodeURIComponent((location.hash || '').slice(1));
  if (!id) return;
  const target = grid.querySelector('#' + CSS.escape(id));
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 1800);
  }
}

async function main() {
  const grid = document.querySelector('#term-grid');
  const searchBox = document.querySelector('#search');
  const filterBar = document.querySelector('#category-filter');
  if (!grid) return;

  let terms = [];
  try {
    await loadTerms();
    terms = allTerms();
  } catch (e) {
    grid.append(el('li', { text: 'Failed to load glossary data: ' + e }));
    return;
  }

  const frag = document.createDocumentFragment();
  terms.forEach((t) => frag.appendChild(card(t)));
  grid.replaceChildren(frag);

  // The authored card order (used to restore the grid when a query is cleared).
  const originalOrder = Array.from(grid.children);

  // Term-card popover
  mountTermCards();

  // category filter buttons — ordered so a beginner meets the building blocks
  // first (foundation → concept → practice), then the rest alphabetically.
  if (filterBar) {
    const ORDER = ['foundation', 'concept', 'practice', 'lineage', 'institution', 'script'];
    const present = new Set(terms.map((t) => t.category));
    const ordered = [
      ...ORDER.filter((c) => present.has(c)),
      ...[...present].filter((c) => !ORDER.includes(c)).sort(),
    ];
    const cats = ['all', ...ordered];
    const labels = { all: 'all', foundation: 'foundation · start here' };
    cats.forEach((c) => {
      const b = el('button', { class: 'filter-btn', text: labels[c] || c });
      b.dataset.cat = c;
      b.setAttribute('aria-pressed', c === 'all' ? 'true' : 'false');
      filterBar.appendChild(b);
    });
  }

  let activeCat = 'all';
  let queryTokens = [];     // tokenized query; empty = match everything

  // Rank a (matching) card against the active query: lower = higher priority.
  //   0 — a query token lands on the name/phonetic or Wylie
  //   1 — lands on a keyword / category / sanskrit (but not the name)
  //   2 — gloss-only match
  // Whole-query strength: a card scores by its BEST-tier query token, then by
  // how many query tokens reach the name (more = stronger), as a tiebreak.
  function rankCard(li) {
    let best = 2;
    let nameHits = 0;
    queryTokens.forEach((q) => {
      if (haystackMatches(li._nameTokens || [], [q])) { best = Math.min(best, 0); nameHits++; }
      else if (haystackMatches(li._tagTokens || [], [q])) { best = Math.min(best, 1); }
    });
    return { best, nameHits };
  }

  function apply() {
    const cards = Array.from(grid.querySelectorAll('.term-card'));
    cards.forEach((li) => {
      const matchCat = activeCat === 'all' || li.dataset.category === activeCat;
      const matchQ = !queryTokens.length || haystackMatches(li._searchTokens || [], queryTokens);
      li.hidden = !(matchCat && matchQ);
    });

    if (!queryTokens.length) {
      // No query: restore the authored order so the grid reads as designed.
      const frag = document.createDocumentFragment();
      originalOrder.forEach((li) => frag.appendChild(li));
      grid.appendChild(frag);
      return;
    }

    // Query active: order visible cards by rank (name → tag → gloss). Hidden
    // cards keep their authored order, parked after the visible ranked block so
    // clearing the query can restore cleanly.
    const visible = cards.filter((li) => !li.hidden);
    const hidden = originalOrder.filter((li) => li.hidden);
    const ranked = visible
      .map((li) => ({ li, r: rankCard(li) }))
      .sort((a, b) => (a.r.best - b.r.best) || (b.r.nameHits - a.r.nameHits)
        || (originalOrder.indexOf(a.li) - originalOrder.indexOf(b.li)));
    const frag = document.createDocumentFragment();
    ranked.forEach((x) => frag.appendChild(x.li));
    hidden.forEach((li) => frag.appendChild(li));
    grid.appendChild(frag);
  }

  if (searchBox) searchBox.addEventListener('input', (e) => { queryTokens = tokenize(e.target.value); apply(); });
  if (filterBar) filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    activeCat = btn.dataset.cat;
    filterBar.querySelectorAll('.filter-btn').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    apply();
  });

  highlightFromHash(grid);
  window.addEventListener('hashchange', () => highlightFromHash(grid));
}

main();
