/* Homepage behavior. Wires:
   - the six in-page tabs (ARIA tabs pattern + hash routing) — tabs.js
   - site-wide term-card popovers (terms.js)
   - the three visualizations with accessible fallbacks (viz.js):
       · the concept map ("The Path" tab — visible by default)
       · the lineage tree + controversy diagram ("Lineage & Controversy" tab)
   - the Phowa-only syllable-walk animation (phowa.js)
   All interactive features degrade gracefully and honor prefers-reduced-motion.

   Tab-aware viz mounting: a panel that starts hidden has zero width, so a D3
   viz mounted into it would lay out at 0px. We therefore (re)draw a panel's
   viz the first time its tab is shown, and resize/redraw on every later show. */

import { loadTerms, mountTermCards, mountTermModal } from './terms.js';
import { renderLineage, renderControversy, renderConceptMap, redrawConceptMap, watchResize } from './viz.js';
import { mountTabs } from './tabs.js';
import { mountPhowaWalk } from './phowa.js';
import { mountQuiz } from './quiz.js';
import { mountKaraoke, getKaraoke } from './vajrasattva-karaoke.js';

/* ---- D3 viz inside the Lineage & Controversy panel ----
   Drawn lazily: first when that tab is shown (so the panel has a real width),
   then redrawn on every subsequent show (a resize while hidden is a no-op).
   watchResize keeps them live while the panel is the visible one. */
let lineageDrawn = false;
function drawLineagePanelViz() {
  if (!window.d3) return;             // accessible table fallbacks remain visible
  renderLineage('lineage-tree');
  renderControversy('controversy-diagram');
}
function initLineageViz() {
  if (!window.d3) return;
  // Redraw on resize, but only while the panel is visible (clientWidth > 0).
  watchResize(() => {
    const panel = document.getElementById('panel-lineage');
    if (panel && !panel.hidden) drawLineagePanelViz();
  });
}

/* ---- Concept-relationship map ("The Path" tab, visible by default) ----
   The DOM (bands + [data-term] node chips) is built BEFORE mountTermCards()
   runs, so the global hover/focus wiring also covers the chips. Only arrow
   geometry recomputes on resize / on tab re-show. */
async function buildConceptMap() {
  const mount = document.getElementById('concept-map');
  if (!mount) return;
  try {
    const res = await fetch('/dorje-sempa/data/concept-map.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('concept-map.json HTTP ' + res.status);
    const data = await res.json();
    renderConceptMap('concept-map', data);
    watchResize(() => redrawConceptMap('concept-map'));
  } catch (e) {
    // The accessible <details> fallback (list + relationships table) stands in.
    console.warn('concept map not rendered:', e);
  }
}

/* Fired by tabs.js whenever a panel becomes visible. Used to (re)draw any viz
   that needs a real width — they measure clientWidth, which is 0 while hidden. */
function onTabShow(id) {
  if (id === 'the-path') {
    // The map's DOM is stable; just recompute arrow geometry against live rects.
    redrawConceptMap('concept-map');
  } else if (id === 'lineage') {
    if (!lineageDrawn) { drawLineagePanelViz(); lineageDrawn = true; }
    else { drawLineagePanelViz(); }   // re-measure at current width on re-show
  } else if (id === 'quiz') {
    // Idempotent: builds the store + loads terms once, then re-renders the
    // start screen (refreshing the known/review counts) on every show.
    mountQuiz(document.getElementById('panel-quiz'));
  } else if (id === 'recitation') {
    // Mount once into #vk-mount; reset to 100 (ready, not autoplaying — the
    // recitation is intentional, the user presses Play).
    const k = mountKaraoke();
    if (k) k.reset();
  }
  // Stop the karaoke rAF loop whenever we leave its tab (the panel goes
  // [hidden] = display:none; a running loop would burn cycles and desync).
  if (id !== 'recitation') { const k = getKaraoke(); if (k) k.pause(); }
}

async function init() {
  // Load the glossary terms FIRST: the concept map reads each linked term to
  // show the Tibetan glyph + English keyword on its glyph nodes (viz.js
  // getTerm()), and the popover wiring needs the store too. Terms are
  // progressive enhancement — a failure just leaves the <details> fallbacks.
  let termsReady = true;
  try {
    await loadTerms();
  } catch (e) {
    termsReady = false;
    console.warn('terms not loaded:', e);
  }
  // Build the concept-map DOM next so its [data-term] chips exist when the
  // single mountTermCards() wiring runs (avoids double-binding the popover).
  await buildConceptMap();
  if (termsReady) {
    mountTermCards();
    mountTermModal();     // centered, dismiss-only term card (Path-viz node clicks)
  }
  initLineageViz();
  // Mount the tabs LAST so onTabShow can safely (re)draw viz that now exist.
  // The default/initial activation fires onTabShow for the starting tab.
  mountTabs({ onShow: onTabShow });
  mountPhowaWalk('phowa-walk');
}

init();
