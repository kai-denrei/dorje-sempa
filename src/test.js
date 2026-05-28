/* Tibetan proof / eyeball harness (handover §11 step 1+2).
   Renders EVERY glossary.json term at display size so a human can eyeball the
   stacks before anything is built on them. Verification badges make unverified
   strings impossible to miss — this is the notify-and-continue safeguard. */

import { glossHtml } from './terms.js';

const TSHEG = '་';

function el(tag, opts = {}) {
  const n = document.createElement(tag);
  if (opts.class) n.className = opts.class;
  if (opts.text != null) n.textContent = opts.text;
  if (opts.lang) n.lang = opts.lang;
  return n;
}

// Split a Tibetan run on the tsheg into bare syllables (the full run keeps its tsheg).
function splitSyllables(tibetan) {
  return tibetan.split(TSHEG).map((s) => s.trim()).filter(Boolean);
}

function hasTibetan(t) {
  return !!(t && t.tibetan && t.tibetan.trim());
}

// A gloss span with *bold* member-keyword spans rendered safely (escape → <strong>).
function glossSpan(t) {
  const span = el('span', { class: 'gloss' });
  span.innerHTML = glossHtml(t.gloss);
  return span;
}

function card(t) {
  const li = el('li', { class: 'term-card' });
  const tib = hasTibetan(t);

  if (tib) {
    // Tibetan-bearing term: show the glyph + chips + verification badge.
    li.dataset.unverified = (!t.tibetanVerified).toString();
    const verified = !!t.tibetanVerified;
    const badge = el('span', {
      class: 'verify ' + (verified ? 'ok' : 'unverified'),
      text: verified ? 'verified' : 'unverified',
    });
    if (t.tibetanSource) badge.title = t.tibetanSource;

    const glyph = el('span', { class: 'tib', lang: 'bo', text: t.tibetan });

    const syl = el('div', { class: 'syllables' });
    syl.setAttribute('aria-hidden', 'true');
    splitSyllables(t.tibetan).forEach((s) =>
      syl.appendChild(el('span', { class: 'syllable', lang: 'bo', text: s }))
    );

    li.append(
      badge,
      el('span', { class: 'cat', text: t.category }),
      glyph,
      el('span', { class: 'phonetic', text: t.phonetic }),
      el('span', { class: 'wylie', text: t.wylie }),
      glossSpan(t),
      syl
    );
  } else {
    // Concept term with no Tibetan headword — shown clearly marked, dimmed,
    // so the proof sheet stays a clean Tibetan-verification view.
    li.dataset.concept = 'true';
    li.append(
      el('span', { class: 'verify concept', text: 'no Tibetan' }),
      el('span', { class: 'cat', text: t.category }),
      el('span', { class: 'head', text: t.phonetic })
    );
    if (t.sanskrit) li.append(el('span', { class: 'sanskrit', text: t.sanskrit }));
    li.append(
      el('span', { class: 'no-tib-note', text: 'no Tibetan headword' }),
      glossSpan(t)
    );
  }
  return li;
}

async function main() {
  const grid = document.querySelector('#term-grid');
  const status = document.querySelector('#verify-status');
  try {
    const res = await fetch('/dorje-sempa/data/glossary.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const terms = data.terms || [];
    const tibTerms = terms.filter(hasTibetan);
    const conceptTerms = terms.length - tibTerms.length;
    // Only Tibetan-bearing terms have a glyph to verify.
    const unverified = tibTerms.filter((t) => !t.tibetanVerified).length;

    status.textContent =
      tibTerms.length + ' Tibetan terms · ' + unverified +
      ' unverified — verify each against THL / Wiktionary(bo) / Rangjung Yeshe before shipping.' +
      ' (' + conceptTerms + ' concept terms have no Tibetan headword.)';
    status.className = 'verify-summary ' + (unverified ? 'warn' : 'ok');

    const frag = document.createDocumentFragment();
    terms.forEach((t) => frag.appendChild(card(t)));
    grid.replaceChildren(frag);
  } catch (e) {
    status.className = 'verify-summary warn';
    status.textContent =
      'Failed to load /dorje-sempa/data/glossary.json — serve from the project root (e.g. python3 -m http.server). ' + e;
  }
}

main();
