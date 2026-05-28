/* D3 visualizations (handover §4.2 lineage tree + §4.5 controversy diagram).
   d3 v7 is self-hosted and loaded as a UMD global (window.d3) by a classic
   <script> tag, so this module reads window.d3. Both viz:
   - have an accessible table fallback already in the markup (<details>);
   - honor prefers-reduced-motion (no transitions when set);
   - degrade to a vertical/stacked layout on narrow screens. */

import { getTerm, hasTibetan, splitSyllables } from './terms.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function d3() { return window.d3; }

/* ---------------- Lineage transmission tree (§4.2) ----------------
   A continuous trunk: Vajradhara → … → 16th Karmapa, then bifurcating into the
   two 17th claimants. 1st / 2nd / 5th / 16th labeled; intervening Karmapas are
   unlabeled "beads" on the rosary. */
const LINEAGE = [
  { id: 'vajradhara', label: 'Vajradhara', sub: 'primordial', bead: false },
  { id: 'tilopa', label: 'Tilopa', sub: '988–1069', bead: false },
  { id: 'naropa', label: 'Nāropa', sub: '1016–1100', bead: false },
  { id: 'marpa', label: 'Marpa', sub: '1012–1097', bead: false },
  { id: 'milarepa', label: 'Milarepa', sub: '1052–1135', bead: false },
  { id: 'gampopa', label: 'Gampopa', sub: '1079–1153', bead: false },
  { id: 'k1', label: '1st Karmapa', sub: 'Düsum Khyenpa · 1110–1193', bead: false },
  { id: 'k2', label: '2nd Karmapa', sub: 'Karma Pakshi · 1204–1283', bead: false },
  { id: 'b3', label: '', sub: '3rd Karmapa', bead: true },
  { id: 'b4', label: '', sub: '4th Karmapa', bead: true },
  { id: 'k5', label: '5th Karmapa', sub: 'Black Crown gift era', bead: false },
  { id: 'b6', label: '', sub: 'intervening Karmapas', bead: true },
  { id: 'b7', label: '', sub: 'intervening Karmapas', bead: true },
  { id: 'b8', label: '', sub: 'intervening Karmapas', bead: true },
  { id: 'k16', label: '16th Karmapa', sub: 'Rangjung Rigpe Dorje · 1924–1981', bead: false },
];
const CLAIMANTS = [
  { id: 'otd', label: 'Ogyen Trinley Dorje', sub: 'b. 1985 · held by the majority' },
  { id: 'ttd', label: 'Trinley Thaye Dorje', sub: 'b. 1983 · followed by Diamond Way' },
];

export function renderLineage(mountId) {
  const D = d3();
  const mount = document.getElementById(mountId);
  if (!D || !mount) return;
  mount.replaceChildren();

  const vertical = mount.clientWidth < 640;
  const n = LINEAGE.length;
  const gap = 78;
  const trunkLen = (n - 1) * gap;

  // layout coordinates
  const W = mount.clientWidth || 800;
  let H, nodes, branches;
  const pad = 40;

  if (vertical) {
    H = trunkLen + 160;
    const cx = W / 2;
    nodes = LINEAGE.map((d, i) => ({ ...d, x: cx, y: pad + i * gap }));
    const tip = nodes[nodes.length - 1];
    branches = [
      { ...CLAIMANTS[0], x: cx - W * 0.24, y: tip.y + 120 },
      { ...CLAIMANTS[1], x: cx + W * 0.24, y: tip.y + 120 },
    ];
  } else {
    H = 360;
    const cy = 130;
    const usable = W - pad * 2 - 220; // leave room for the fork on the right
    const stepX = usable / (n - 1);
    nodes = LINEAGE.map((d, i) => ({ ...d, x: pad + i * stepX, y: cy }));
    const tip = nodes[nodes.length - 1];
    branches = [
      { ...CLAIMANTS[0], x: tip.x + 170, y: cy - 70 },
      { ...CLAIMANTS[1], x: tip.x + 170, y: cy + 70 },
    ];
  }

  const svg = D.select(mount).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', '100%').attr('height', H)
    .attr('role', 'presentation');

  const css = getComputedStyle(document.documentElement);
  const maroon = css.getPropertyValue('--maroon').trim() || '#7a3a31';
  const gold = css.getPropertyValue('--saffron').trim() || '#e0a23c';
  const ink = css.getPropertyValue('--ink').trim() || '#383128';
  const inkSoft = css.getPropertyValue('--ink-soft').trim() || '#6b6253';
  const indigo = css.getPropertyValue('--indigo').trim() || '#3f4a8a';

  // trunk
  const line = D.line().x((d) => d.x).y((d) => d.y);
  svg.append('path').datum(nodes).attr('d', line)
    .attr('fill', 'none').attr('stroke', maroon).attr('stroke-width', 3).attr('stroke-linecap', 'round');

  // fork lines to claimants
  const tip = nodes[nodes.length - 1];
  branches.forEach((b, i) => {
    svg.append('path')
      .attr('d', `M${tip.x},${tip.y} L${b.x},${b.y}`)
      .attr('fill', 'none').attr('stroke', i === 0 ? maroon : indigo)
      .attr('stroke-width', 2.5).attr('stroke-dasharray', '1 0');
  });

  // node groups
  const g = svg.selectAll('g.node').data(nodes).enter().append('g')
    .attr('class', 'node')
    .attr('tabindex', 0)
    .attr('transform', (d) => `translate(${d.x},${d.y})`)
    .attr('role', 'listitem')
    .attr('aria-label', (d) => (d.label || 'A Karmapa of the line') + (d.sub ? ' — ' + d.sub : ''));

  g.append('circle')
    .attr('r', (d) => (d.bead ? 5 : 9))
    .attr('fill', (d) => (d.bead ? gold : maroon))
    .attr('stroke', '#fff').attr('stroke-width', 1.5);

  // labels for non-bead nodes
  const labelG = g.filter((d) => !d.bead);
  labelG.append('text')
    .attr('class', 'viz-label')
    .attr('x', vertical ? 16 : 0)
    .attr('y', vertical ? 4 : -18)
    .attr('text-anchor', vertical ? 'start' : 'middle')
    .attr('fill', ink).attr('font-size', 12).attr('font-weight', 600)
    .text((d) => d.label);
  labelG.append('text')
    .attr('class', 'viz-sub')
    .attr('x', vertical ? 16 : 0)
    .attr('y', vertical ? 19 : 24)
    .attr('text-anchor', vertical ? 'start' : 'middle')
    .attr('fill', inkSoft).attr('font-size', 10)
    .text((d) => d.sub);

  // claimant nodes (the bifurcation)
  const cg = svg.selectAll('g.claimant-node').data(branches).enter().append('g')
    .attr('class', 'claimant-node')
    .attr('tabindex', 0)
    .attr('transform', (d) => `translate(${d.x},${d.y})`)
    .attr('role', 'listitem')
    .attr('aria-label', (d) => '17th Karmapa claimant: ' + d.label + ' — ' + d.sub);
  cg.append('circle').attr('r', 8)
    .attr('fill', (d, i) => (i === 0 ? maroon : indigo)).attr('stroke', '#fff').attr('stroke-width', 1.5);
  cg.append('text')
    .attr('x', vertical ? 0 : 14).attr('y', vertical ? -16 : 4)
    .attr('text-anchor', vertical ? 'middle' : 'start')
    .attr('fill', ink).attr('font-size', 12).attr('font-weight', 600)
    .text((d) => d.label);
  cg.append('text')
    .attr('x', vertical ? 0 : 14).attr('y', vertical ? -2 : 20)
    .attr('text-anchor', vertical ? 'middle' : 'start')
    .attr('fill', inkSoft).attr('font-size', 10)
    .text((d) => d.sub);

  if (!reduceMotion) {
    g.style('opacity', 0).transition().duration(500).delay((d, i) => i * 45).style('opacity', 1);
    cg.style('opacity', 0).transition().duration(500).delay(n * 45 + 120).style('opacity', 1);
  }
}

/* ---------------- Controversy branching diagram (§4.5) ----------------
   The split into two recognitions, plus the reconciliation timeline nodes. */
export function renderControversy(mountId) {
  const D = d3();
  const mount = document.getElementById(mountId);
  if (!D || !mount) return;
  mount.replaceChildren();

  const W = mount.clientWidth || 800;
  const vertical = W < 640;
  const css = getComputedStyle(document.documentElement);
  const maroon = css.getPropertyValue('--maroon').trim() || '#7a3a31';
  const indigo = css.getPropertyValue('--indigo').trim() || '#3f4a8a';
  const ink = css.getPropertyValue('--ink').trim() || '#383128';
  const inkSoft = css.getPropertyValue('--ink-soft').trim() || '#6b6253';
  const jade = css.getPropertyValue('--jade').trim() || '#4f9e84';

  // node model
  const root = { id: 'death', label: '16th Karmapa dies', sub: '1981 · no agreed successor', kind: 'root' };
  const a = { id: 'otd', label: 'Ogyen Trinley Dorje', sub: 'recog. Tai Situ & Gyaltsab · 1992 · majority', kind: 'a' };
  const b = { id: 'ttd', label: 'Trinley Thaye Dorje', sub: 'recog. 14th Shamarpa · 1994 · Diamond Way', kind: 'b' };
  const recon = [
    { id: 'meet', label: 'First meeting', sub: 'France, 2018', kind: 'recon' },
    { id: 'joint', label: 'Joint statement', sub: 'Dec 2023 · jointly recognize next Shamarpa', kind: 'recon' },
  ];

  let H, place;
  if (vertical) {
    H = 560; const cx = W / 2;
    place = { death: { x: cx, y: 50 }, otd: { x: cx - W * 0.22, y: 170 }, ttd: { x: cx + W * 0.22, y: 170 },
              meet: { x: cx, y: 330 }, joint: { x: cx, y: 450 } };
  } else {
    H = 340;
    place = { death: { x: 90, y: 170 }, otd: { x: W * 0.42, y: 80 }, ttd: { x: W * 0.42, y: 260 },
              meet: { x: W * 0.72, y: 130 }, joint: { x: W * 0.72, y: 210 } };
  }

  const svg = D.select(mount).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H)
    .attr('role', 'presentation');

  function link(p1, p2, color, dash) {
    svg.append('path').attr('d', `M${p1.x},${p1.y} L${p2.x},${p2.y}`)
      .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.5)
      .attr('stroke-dasharray', dash || null).attr('opacity', 0.9);
  }
  link(place.death, place.otd, maroon);
  link(place.death, place.ttd, indigo);
  // reconciliation links (dashed = healing, not full reunification)
  link(place.otd, place.meet, jade, '5 5');
  link(place.ttd, place.meet, jade, '5 5');
  link(place.meet, place.joint, jade, '5 5');

  const all = [root, a, b, ...recon];
  const colorOf = (k) => (k === 'a' ? maroon : k === 'b' ? indigo : k === 'recon' ? jade : ink);

  const g = svg.selectAll('g.cnode').data(all).enter().append('g')
    .attr('class', 'cnode').attr('tabindex', 0)
    .attr('transform', (d) => { const p = place[d.id]; return `translate(${p.x},${p.y})`; })
    .attr('role', 'listitem')
    .attr('aria-label', (d) => d.label + ' — ' + d.sub);

  g.append('rect')
    .attr('x', -6).attr('y', -6).attr('width', 12).attr('height', 12)
    .attr('rx', 3).attr('fill', (d) => colorOf(d.kind)).attr('stroke', '#fff').attr('stroke-width', 1.5);
  g.append('text').attr('y', -16).attr('text-anchor', 'middle')
    .attr('fill', ink).attr('font-size', 12).attr('font-weight', 600).text((d) => d.label);
  g.append('text').attr('y', 24).attr('text-anchor', 'middle')
    .attr('fill', inkSoft).attr('font-size', 10).text((d) => d.sub);

  if (!reduceMotion) {
    g.style('opacity', 0).transition().duration(450).delay((d, i) => i * 90).style('opacity', 1);
  }
}

/* ---------------- Concept-relationship map (§4.6) ----------------
   How the core practices/concepts feed into one another. Hybrid render:
   - Nodes are REAL HTML elements (focusable, selectable, [data-term] hover
     works) laid out in horizontal STAGE BANDS, top→bottom = ground→fruition.
     Vertical position encodes the stage; this is NOT a force layout.
   - Groups (Ngöndro, Six Yogas) are light inset containers whose member nodes
     are chips inside — containment IS the part-of relation, so NO arrows are
     drawn to group members.
   - An SVG layer BEHIND the nodes draws one arrow per cross-stage edge, with
     endpoints computed from the rendered nodes' getBoundingClientRect.
   Edge-type layering (Tufte): feeds = solid maroon (the spine dominates);
   requires/supports = lighter dashed ink-soft; secondary = lightest gray
   dashed (whispers). Only the emphasis node (Mahāmudrā) gets a gold touch.
   The arrows are decorative duplicates of the <details> relationships table,
   which is the authoritative, screen-reader-readable list of all 17 edges. */

let cmDataCache = null;        // keep the loaded data for resize re-draws
const CM_NS = 'http://www.w3.org/2000/svg';

function cmColors() {
  const css = getComputedStyle(document.documentElement);
  const get = (v, f) => (css.getPropertyValue(v).trim() || f);
  return {
    maroon: get('--maroon', '#7a3a31'),
    saffron: get('--saffron', '#e0a23c'),
    gold: get('--gold', '#e6b94f'),
    inkSoft: get('--ink-soft', '#6b6253'),
    rule: get('--rule', '#d9cfba'),
    ruleStrong: get('--rule-strong', '#b9aa8c'),
    paper: get('--paper', '#f6f2e9'),
  };
}

/* Build the static DOM (bands, groups, nodes) once. Called on first render and
   never needs the wider window — it's the SVG that recomputes on resize. */
function buildConceptDom(mount, data) {
  mount.replaceChildren();
  mount.classList.add('cmap');

  // SVG arrow layer goes first so it sits BEHIND the HTML nodes (z-index in CSS).
  const svg = document.createElementNS(CM_NS, 'svg');
  svg.setAttribute('class', 'cmap-edges');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'none');
  mount.appendChild(svg);

  const lanes = document.createElement('div');
  lanes.className = 'cmap-lanes';
  mount.appendChild(lanes);

  // SVG label layer goes LAST so it sits ABOVE the HTML node boxes (z-index in
  // CSS). Edge labels are drawn here, not into the arrow layer, so a label can
  // never be hidden behind a node box (the bug fix). Pointer-events stay off so
  // the boxes beneath remain hoverable/clickable.
  const labelSvg = document.createElementNS(CM_NS, 'svg');
  labelSvg.setAttribute('class', 'cmap-edge-labels');
  labelSvg.setAttribute('aria-hidden', 'true');
  labelSvg.setAttribute('preserveAspectRatio', 'none');
  mount.appendChild(labelSvg);

  // Index nodes by stage and by group.
  const byStage = new Map(data.stages.map((s) => [s.id, []]));
  const groupHead = new Map();        // group id -> head node
  const groupMembers = new Map();     // group id -> [member nodes]
  data.nodes.forEach((n) => {
    if (n.isGroupHead) groupHead.set(n.isGroupHead, n);
    else if (n.group) (groupMembers.get(n.group) || groupMembers.set(n.group, []).get(n.group)).push(n);
    else (byStage.get(n.stage) || []).push(n);
  });
  const groupsByStage = new Map();
  data.groups.forEach((g) => {
    (groupsByStage.get(g.stage) || groupsByStage.set(g.stage, []).get(g.stage)).push(g);
  });

  const makeNode = (n, extraClass, opts = {}) => {
    const el = document.createElement('div');
    el.className = 'cmap-node' + (extraClass ? ' ' + extraClass : '');
    el.id = 'cm-' + n.id;
    if (n.emphasis) el.classList.add('is-emphasis');

    // Group-head anchors only exist to anchor cross-stage arrows; the group's
    // own `cmap-group-name` already prints the head's label, so render the
    // anchor bare (no duplicated label/glyph, not focusable, no popover) — this
    // is what kept "Six Yogas of Nāropa" / "Ngöndro" from rendering twice.
    if (opts.bare) { el.setAttribute('aria-hidden', 'true'); return el; }

    // Real focusable text; glossary hover fires via mountTermCards() if data-term.
    el.tabIndex = 0;
    if (n.glossary) {
      el.setAttribute('data-term', n.glossary);
      // Centerpiece behavior: each glossary-linked node is also a deep link into
      // the glossary page (the highlight/flash already lives there). The hover/
      // focus popover (terms.js, delegated on mouseover/focusin) is preserved —
      // we only intercept click + Enter/Space so the primary action is "open the
      // glossary entry," not "toggle the popover." stopPropagation keeps
      // terms.js's document-level click from also firing; stopImmediatePropagation
      // on keydown keeps its same-element Enter/Space handler from firing.
      el.setAttribute('role', 'link');
      el.classList.add('cmap-node--link');
      el.setAttribute('aria-label',
        n.label + (n.role ? ' — ' + n.role : '') + '. Open in the glossary.');
      const dest = '/glossary/#' + n.glossary;
      const go = () => { window.location.href = dest; };
      el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); go(); });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault(); e.stopImmediatePropagation(); go();
        }
      });
    }

    // If the linked glossary term carries a Tibetan headword, lead with the
    // glyph (the hero, kept on top) and put the node `label` beneath it as a
    // small Latin keyword — so a beginner can read the node, not just admire
    // the script. The full role/definition stays in the hover popover + the
    // <details> fallback, so we don't also cram `role` under glyph nodes.
    const term = n.glossary ? getTerm(n.glossary) : null;
    const glyph = term && hasTibetan(term) ? term.tibetan : '';

    if (glyph) {
      el.classList.add('cmap-node--glyph');
      const tib = document.createElement('span');
      tib.className = 'cmap-node-tib';
      tib.lang = 'bo';
      tib.setAttribute('aria-hidden', 'true');   // the keyword label below carries the name
      tib.textContent = glyph;
      el.appendChild(tib);
      const key = document.createElement('span');
      key.className = 'cmap-node-key';
      key.textContent = n.label;
      el.appendChild(key);
    } else {
      const label = document.createElement('span');
      label.className = 'cmap-node-label';
      label.textContent = n.label;
      el.appendChild(label);
      if (n.role) {
        const role = document.createElement('span');
        role.className = 'cmap-node-role';
        role.textContent = n.role;
        el.appendChild(role);
      }
    }
    return el;
  };

  data.stages.forEach((stage) => {
    const band = document.createElement('div');
    band.className = 'cmap-band';
    band.dataset.stage = stage.id;

    const lab = document.createElement('div');
    lab.className = 'cmap-band-label';
    const t = document.createElement('span');
    t.className = 'cmap-band-title';
    t.textContent = stage.label;
    lab.appendChild(t);
    if (stage.note) {
      const note = document.createElement('span');
      note.className = 'cmap-band-note';
      note.textContent = stage.note;
      lab.appendChild(note);
    }
    band.appendChild(lab);

    const row = document.createElement('div');
    row.className = 'cmap-band-row';

    // Plain (non-group) nodes for this stage.
    (byStage.get(stage.id) || []).forEach((n) => row.appendChild(makeNode(n)));

    // Group containers for this stage (the part-of relation, shown by containment).
    (groupsByStage.get(stage.id) || []).forEach((g) => {
      const box = document.createElement('div');
      box.className = 'cmap-group';
      const head = groupHead.get(g.id);
      const gl = document.createElement('div');
      gl.className = 'cmap-group-label';
      const gname = document.createElement('span');
      gname.className = 'cmap-group-name';
      gname.textContent = head ? head.label : g.id;
      gl.appendChild(gname);
      if (g.label) {
        const gsub = document.createElement('span');
        gsub.className = 'cmap-group-sub';
        gsub.textContent = g.label;
        gl.appendChild(gsub);
      }
      box.appendChild(gl);
      // The head node carries the cross-stage edges, so it must be a real node
      // (with an id) for arrow endpoints — render it as a hidden anchor point.
      if (head) {
        const anchor = makeNode(head, 'cmap-group-head', { bare: true });
        box.appendChild(anchor);
      }
      const chips = document.createElement('div');
      chips.className = 'cmap-chips';
      (groupMembers.get(g.id) || []).forEach((m) => chips.appendChild(makeNode(m, 'cmap-chip')));
      box.appendChild(chips);
      row.appendChild(box);
    });

    band.appendChild(row);
    lanes.appendChild(band);
  });

  return { svg, labelSvg };
}

/* Compute and draw the arrow geometry from the live node rectangles. Runs on
   first render and on every (debounced) resize. Skipped on narrow viewports —
   there the stacked bands + the fallback table carry the relationships. */
function drawConceptEdges(mount, svg, labelSvg, data) {
  // Clear previous arrows + labels (the <defs> is rebuilt each call below).
  svg.replaceChildren();
  if (labelSvg) labelSvg.replaceChildren();
  const narrow = mount.clientWidth < 640;
  const W = mount.scrollWidth || mount.clientWidth;
  const H = mount.scrollHeight || mount.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.width = W + 'px';
  svg.style.height = H + 'px';
  if (labelSvg) {
    labelSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    labelSvg.style.width = W + 'px';
    labelSvg.style.height = H + 'px';
  }
  if (narrow) {
    svg.style.display = 'none';
    if (labelSvg) labelSvg.style.display = 'none';
    return;                                            // degrade: no arrows/labels
  }
  svg.style.display = '';
  if (labelSvg) labelSvg.style.display = '';

  const c = cmColors();
  const paperBg = c.paper;     // halo color for edge labels (the band background)
  const base = mount.getBoundingClientRect();
  const center = (id) => {
    const el = document.getElementById('cm-' + id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      el, top: r.top - base.top, bottom: r.bottom - base.top,
      left: r.left - base.left, right: r.right - base.left,
      cx: r.left - base.left + r.width / 2,
      cy: r.top - base.top + r.height / 2,
      h: r.height, w: r.width,
    };
  };

  // Arrowhead markers, one per visual weight so the head color matches the line.
  const defs = document.createElementNS(CM_NS, 'defs');
  const mkMarker = (id, color) => {
    const m = document.createElementNS(CM_NS, 'marker');
    m.setAttribute('id', id);
    m.setAttribute('viewBox', '0 0 10 10');
    m.setAttribute('refX', '8'); m.setAttribute('refY', '5');
    m.setAttribute('markerWidth', '6'); m.setAttribute('markerHeight', '6');
    m.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS(CM_NS, 'path');
    p.setAttribute('d', 'M0,1 L9,5 L0,9 Z');
    p.setAttribute('fill', color);
    m.appendChild(p);
    defs.appendChild(m);
  };
  mkMarker('cm-arrow-feeds', c.maroon);
  mkMarker('cm-arrow-emph', c.saffron);
  mkMarker('cm-arrow-req', c.inkSoft);
  mkMarker('cm-arrow-sec', c.ruleStrong);
  svg.appendChild(defs);

  // All node-box rectangles (mount-relative) for label collision avoidance.
  // Edge labels must never sit behind a box; if the natural midpoint lands on
  // one, we slide the label along the edge's parametric line until it clears.
  const boxRects = [];
  mount.querySelectorAll('.cmap-node, .cmap-group, .cmap-chip').forEach((el) => {
    if (el.getAttribute('aria-hidden') === 'true' && el.classList.contains('cmap-group-head')) return;
    const r = el.getBoundingClientRect();
    boxRects.push({
      left: r.left - base.left, right: r.right - base.left,
      top: r.top - base.top, bottom: r.bottom - base.top,
    });
  });
  // Does a point (with a small text half-extent pad) fall inside any box?
  const hitsBox = (px, py, padX = 26, padY = 9) =>
    boxRects.some((r) =>
      px + padX > r.left && px - padX < r.right &&
      py + padY > r.top && py - padY < r.bottom);

  const styleFor = (type, toEmphasis) => {
    if (type === 'feeds') {
      return toEmphasis
        ? { stroke: c.saffron, width: 2, dash: null, marker: 'cm-arrow-emph', opacity: 1 }
        : { stroke: c.maroon, width: 1.5, dash: null, marker: 'cm-arrow-feeds', opacity: 1 };
    }
    if (type === 'requires' || type === 'supports') {
      return { stroke: c.inkSoft, width: 1.1, dash: '4 3', marker: 'cm-arrow-req', opacity: 0.85 };
    }
    // secondary — whispers
    return { stroke: c.ruleStrong, width: 1, dash: '2 4', marker: 'cm-arrow-sec', opacity: 0.7 };
  };

  data.edges.forEach((e) => {
    const a = center(e.from);
    const b = center(e.to);
    if (!a || !b) return;
    const st = styleFor(e.type, b.el.classList.contains('is-emphasis'));

    // Anchor on the facing edges of the boxes. Most edges flow downward
    // (later stage = lower); a few are same-band (shamatha→vipashyana,
    // wang→yidam) so we route those side-to-side.
    let x1, y1, x2, y2;
    const sameBand = Math.abs(a.cy - b.cy) < a.h * 1.2;
    if (sameBand) {
      // horizontal-ish: exit the side nearest the target
      if (a.cx <= b.cx) { x1 = a.right; x2 = b.left; }
      else { x1 = a.left; x2 = b.right; }
      y1 = a.cy; y2 = b.cy;
    } else if (b.cy > a.cy) {
      x1 = a.cx; y1 = a.bottom; x2 = b.cx; y2 = b.top;       // downward
    } else {
      x1 = a.cx; y1 = a.top; x2 = b.cx; y2 = b.bottom;       // upward (rare)
    }

    // Curved cubic: control points pull along the dominant axis for a calm bow.
    const path = document.createElementNS(CM_NS, 'path');
    let d;
    if (sameBand) {
      const mx = (x1 + x2) / 2;
      d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    } else {
      const my = (y1 + y2) / 2;
      d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
    }
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', st.stroke);
    path.setAttribute('stroke-width', String(st.width));
    if (st.dash) path.setAttribute('stroke-dasharray', st.dash);
    path.setAttribute('opacity', String(st.opacity));
    path.setAttribute('marker-end', `url(#${st.marker})`);
    svg.appendChild(path);

    // Edge label — drawn into the ABOVE-boxes overlay (labelSvg) so it can never
    // hide behind a node box. We sample the edge's own cubic Bézier and pick the
    // sample point that (a) is clear of every node box and (b) is nearest the
    // line's midpoint; if none is fully clear we take the least-bad one. A paper
    // halo keeps the word legible where it crosses an arrow stroke.
    if (e.label && labelSvg) {
      // Cubic control points matching the path drawn above.
      let c0x, c0y, c1x, c1y;
      if (sameBand) {
        const mx = (x1 + x2) / 2;
        c0x = mx; c0y = y1; c1x = mx; c1y = y2;
      } else {
        const my = (y1 + y2) / 2;
        c0x = x1; c0y = my; c1x = x2; c1y = my;
      }
      const bez = (t) => {
        const u = 1 - t, a = u * u * u, b = 3 * u * u * t, cc = 3 * u * t * t, d2 = t * t * t;
        return {
          x: a * x1 + b * c0x + cc * c1x + d2 * x2,
          y: a * y1 + b * c0y + cc * c1y + d2 * y2,
        };
      };
      // Sample t across the middle of the line; prefer points clear of boxes and
      // close to t=0.5. Each candidate gets a small upward lift off the stroke.
      const lift = sameBand ? 7 : 5;
      let best = null, bestClear = null;
      for (let i = 0; i <= 10; i++) {
        const t = 0.2 + (i / 10) * 0.6;        // sample t ∈ [0.2, 0.8]
        const p = bez(t);
        const px = p.x, py = p.y - lift;
        const distMid = Math.abs(t - 0.5);
        if (!hitsBox(px, py)) {
          if (!bestClear || distMid < bestClear.distMid) bestClear = { px, py, distMid };
        }
        if (!best || distMid < best.distMid) best = { px, py, distMid };
      }
      const pos = bestClear || best;
      const txt = document.createElementNS(CM_NS, 'text');
      txt.setAttribute('x', String(pos.px));
      txt.setAttribute('y', String(pos.py));
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('dominant-baseline', 'middle');
      txt.setAttribute('class', 'cmap-edge-label');
      txt.setAttribute('fill', c.inkSoft);
      txt.textContent = e.label;
      // A paper halo (the band background) keeps the word legible over a line —
      // wide enough to clear the stroke without reading as a box.
      txt.setAttribute('paint-order', 'stroke');
      txt.setAttribute('stroke', paperBg);
      txt.setAttribute('stroke-width', '4.5');
      txt.setAttribute('stroke-linejoin', 'round');
      labelSvg.appendChild(txt);
    }
  });
}

export function renderConceptMap(mountId, data) {
  const mount = document.getElementById(mountId);
  if (!mount || !data) return;
  cmDataCache = data;
  const { svg, labelSvg } = buildConceptDom(mount, data);
  // Let layout settle before measuring node rects, then draw arrows + labels.
  requestAnimationFrame(() => drawConceptEdges(mount, svg, labelSvg, data));

  // Gentle entrance (honors reduced motion).
  if (!reduceMotion) {
    const nodes = mount.querySelectorAll('.cmap-node');
    nodes.forEach((n, i) => {
      n.style.opacity = '0';
      n.style.transition = 'opacity 0.4s ease';
      setTimeout(() => { n.style.opacity = ''; }, 40 + i * 24);
    });
  }
}

/* Resize handler for the concept map: rebuild geometry only (DOM is stable). */
export function redrawConceptMap(mountId) {
  const mount = document.getElementById(mountId);
  if (!mount || !cmDataCache) return;
  const svg = mount.querySelector('svg.cmap-edges');
  const labelSvg = mount.querySelector('svg.cmap-edge-labels');
  if (svg) drawConceptEdges(mount, svg, labelSvg, cmDataCache);
}

/* Re-render on resize (debounced) so the vertical/horizontal switch is live. */
export function watchResize(fn) {
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(fn, 200); });
}
