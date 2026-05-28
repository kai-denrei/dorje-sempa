/* Syllable-walk animation — scoped to the featured Phowa term ONLY (locked
   decision §2 / handover §5.3 stretch). Sequentially highlights each tsheg-
   delimited syllable of འཕོ་བ་ with its Wylie reading. Gated behind
   prefers-reduced-motion: when motion is reduced, the term is shown static
   with both syllables already legible (no animation, no flashing). */

import { splitSyllables } from './terms.js';

const READINGS = { 'འཕོ': "'pho", 'བ': 'ba' }; // Wylie per syllable

export function mountPhowaWalk(elId) {
  const host = document.getElementById(elId);
  if (!host) return;
  const tibetan = host.textContent.trim();
  const syllables = splitSyllables(tibetan);
  if (!syllables.length) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Rebuild the glyph as per-syllable spans (keep the tsheg between them visible).
  host.replaceChildren();
  host.setAttribute('aria-label', tibetan + " — 'pho ba, transference");
  const spans = [];
  syllables.forEach((s, i) => {
    const span = document.createElement('span');
    span.className = 'walk-syl';
    span.lang = 'bo';
    span.textContent = s + (i < syllables.length - 1 ? '་' : '་'); // keep tsheg
    host.appendChild(span);
    spans.push(span);
  });

  // Reading caption
  const cap = document.createElement('span');
  cap.className = 'walk-reading';
  cap.setAttribute('aria-hidden', 'true');
  host.parentElement.appendChild(cap);

  if (reduce) {
    // Static: both syllables lightly marked, reading shows full Wylie. No motion.
    spans.forEach((sp) => sp.classList.add('walk-static'));
    cap.textContent = "'pho ba";
    return;
  }

  let i = 0;
  let timer = null;
  function step() {
    spans.forEach((sp) => sp.classList.remove('walk-on'));
    const sp = spans[i];
    sp.classList.add('walk-on');
    const reading = READINGS[syllables[i]] || '';
    cap.textContent = reading;
    i = (i + 1) % spans.length;
  }

  // Only run while the feature is in view; pause otherwise to save cycles.
  let running = false;
  function start() { if (running) return; running = true; step(); timer = setInterval(step, 1400); }
  function stop() { running = false; clearInterval(timer); }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? start() : stop()));
    }, { threshold: 0.4 });
    io.observe(host);
  } else {
    start();
  }
}
