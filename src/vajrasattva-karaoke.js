/* vajrasattva-karaoke.js
   Yig-gya (100-syllable Vajrasattva / Dorje Sempa mantra) karaoke recitation.

   Adapted from HANDOVER_yiggya_karaoke for the Dorje Sempa site: the rAF engine,
   glow envelope, color model and verified 100-unit data are preserved verbatim;
   the integration is changed to match this site — mounted on tab-show via
   src/main.js (the ARIA-tab onShow hook), NOT auto-initialised on load, and no
   `window.__vk` global. The two pure helpers (flattenTokens, countRemaining) are
   exported so the unit count and counter are testable under node:test.

   Vanilla ES module, no deps, no build. All DOM scoped under .vk.
   Public API:
     MANTRA                         the verified phrase/word/syllable data
     flattenTokens(mantra)          pure → { tokens, totalBeats }
     countRemaining(tokens, pos)    pure → colorable units not yet completed
     initVajraKaraoke(mount, opts)  build the widget → { play, pause, reset, destroy }
     mountKaraoke()                 idempotent: init once into #vk-mount → handle
     getKaraoke()                   the live handle (or null) */

export const MANTRA = [
  { en: "(seed sound)",                         words: [["OM"]] },
  { en: "Vajra-Being — the deity addressed",    words: [["BEN","ZA"],["SA","TO"]] },
  { en: "uphold the sacred bond (samaya)",      words: [["SA","MA","YA"],["MA","NU"],["PA","LA","YA"]] },
  { en: "O Vajra-Being",                        words: [["BEN","ZA"],["SA","TO"]] },
  { en: "remain present through your very nature", words: [["TE","NO"],["PA"],["TI","TTHA"]] },
  { en: "be steadfast toward me",               words: [["DRI"],["DHO"],["MEY"],["BHA","WA"]] },
  { en: "be well-pleased with me",              words: [["SU","TO"],["KAYO"],["MEY"],["BHA","WA"]] },
  { en: "nourish me well / make me thrive",     words: [["SU","PO"],["KAYO"],["MEY"],["BHA","WA"]] },
  { en: "be loving toward me",                  words: [["A","NU"],["RAK","TO"],["MEY"],["BHA","WA"]] },
  { en: "grant me all attainments (siddhis)",   words: [["SAR","VA"],["SI","DDHI"],["ME"],["PRA","YA","TSA"]] },
  { en: "and in all my actions",                words: [["SAR","VA"],["KAR","MA"],["SU","TSA"],["ME"]] },
  { en: "make my mind glorious",                words: [["TSI","TTAM"],["SHRI","YAM"],["KU","RU"]] },
  { en: "(seed of awakened mind)",              words: [["HUM"]] },
  { en: "the five wisdoms (four joys + union)", words: [["HA"],["HA"],["HA"],["HA"],["HO"]] },
  { en: "Blessed One",                          words: [["BHA","GA","VAN"]] },
  { en: "all Tathāgatas",                       words: [["SAR","VA"],["TA","THA","GA","TA"]] },
  { en: "O Vajra, do not forsake me",           words: [["BEN","ZA"],["MA"],["ME"],["MUN","TSA"]] },
  { en: "be the vajra-holder",                  words: [["BEN","ZA"],["BHA","WA"]] },
  { en: "Great Pledge-Being",                   words: [["MA","HA"],["SA","MA","YA"],["SA","TO"]] },
  { en: "(sealing seed syllable)",              words: [["AH"]] },
];

const KAYO_BEATS = 2; // merged ṣyo akshara held longer; keeps unit count at 100

/* Pure: flatten the phrase/word/syllable data to a timed token list.
   KAYO is one colorable token but spans KAYO_BEATS beats. Returns the token list
   and the total beat span (102: 100 units + the two extra KAYO beats). */
export function flattenTokens(mantra) {
  const tokens = [];
  let beat = 0;
  mantra.forEach((ph, pi) => {
    ph.words.forEach((word) => word.forEach((syl) => {
      const dur = syl === "KAYO" ? KAYO_BEATS : 1;
      tokens.push({ text: syl, phrase: pi, start: beat, dur, end: beat + dur, el: null, _c: "" });
      beat += dur;
    }));
  });
  return { tokens, totalBeats: beat };
}

/* Pure: how many colorable units have NOT yet finished by beat `pos`. */
export function countRemaining(tokens, pos) {
  let completed = 0;
  for (let i = 0; i < tokens.length; i++) if (tokens[i].end <= pos) completed++;
  return Math.max(0, tokens.length - completed);
}

export function initVajraKaraoke(mount, opts = {}) {
  const cfg = {
    beatMs:   300,   // ms per syllable at speed 1 (100 units ≈ 30s, +KAYO holds)
    attack:   0.35,  // beats of glow rise before a syllable's onset
    trail:    3.0,   // beats of decay after onset (length of the fading tail)
    sungFloor: 0,    // 0 = full comet (returns to neutral); e.g. 0.12 leaves a dim sung trail
    autoplay: false,
    ...opts,
  };

  // ---- flatten to timed token list ----
  const { tokens, totalBeats } = flattenTokens(MANTRA);
  const phrases = MANTRA.map((ph) => ({ en: ph.en, el: null, _c: "" }));
  const TOTAL = tokens.length;       // 100

  // ---- DOM ----
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  mount.classList.add("vk");
  mount.innerHTML = "";

  const counter = el("div", "vk-counter");
  const num = el("div", "vk-num"); num.textContent = String(TOTAL);
  const lab = el("div", "vk-label"); lab.textContent = "syllables remaining";
  const track = el("div", "vk-track"); const fill = el("div", "vk-fill"); track.appendChild(fill);
  counter.append(num, lab, track);

  const sylWrap = el("div", "vk-syllables");
  MANTRA.forEach((ph) => {
    const pEl = el("span", "vk-phrase");
    ph.words.forEach((word) => {
      const wEl = el("span", "vk-word");
      word.forEach((syl) => { const s = el("span", "vk-syl"); s.textContent = syl; wEl.appendChild(s); });
      pEl.appendChild(wEl);
    });
    sylWrap.appendChild(pEl);
  });

  const glossWrap = el("div", "vk-gloss");
  phrases.forEach((p) => { const g = el("div", "vk-en"); g.textContent = p.en; glossWrap.appendChild(g); p.el = g; });

  const ctl = el("div", "vk-controls");
  const btnPlay  = el("button", "vk-btn"); btnPlay.type = "button";  btnPlay.textContent  = "▶ Play";
  const btnReset = el("button", "vk-btn"); btnReset.type = "button"; btnReset.textContent = "↺ Restart";
  const spdWrap  = el("label", "vk-speed"); spdWrap.textContent = "pace ";
  const spd = el("input"); spd.type = "range"; spd.min = "0.5"; spd.max = "1.6"; spd.step = "0.05"; spd.value = "1";
  spdWrap.appendChild(spd);
  ctl.append(btnPlay, btnReset, spdWrap);

  mount.append(counter, sylWrap, glossWrap, ctl);

  // bind token elements (DOM built in same nested order as `tokens`)
  const sylEls = sylWrap.querySelectorAll(".vk-syl");
  tokens.forEach((tk, i) => { tk.el = sylEls[i]; });

  // ---- color model: neutral(white) -> fade(dark orange) -> on(bright orange) ----
  const colorFor = (g) => {
    if (g <= 0.002) return "var(--vk-neutral)";
    if (g >= 0.998) return "var(--vk-on)";
    if (g < 0.5) { const t = g / 0.5;
      return `color-mix(in oklch, var(--vk-neutral) ${((1-t)*100).toFixed(1)}%, var(--vk-fade) ${(t*100).toFixed(1)}%)`; }
    const t = (g - 0.5) / 0.5;
    return `color-mix(in oklch, var(--vk-fade) ${((1-t)*100).toFixed(1)}%, var(--vk-on) ${(t*100).toFixed(1)}%)`;
  };

  // glow envelope: quick attack into onset, hold across its (possibly long) beat, slow decay tail
  const glow = (pos, start, dur) => {
    if (pos < start - cfg.attack) return 0;
    if (pos < start) return (pos - (start - cfg.attack)) / cfg.attack;   // rise 0..1
    const end = start + dur;
    if (pos <= end) return 1;                                            // hold
    const d = (pos - end) / cfg.trail;                                   // decay
    return d >= 1 ? cfg.sungFloor : cfg.sungFloor + (1 - cfg.sungFloor) * (1 - d);
  };

  // ---- render ----
  let lastNum = -1;
  const pglow = new Array(phrases.length);
  function render(pos) {
    const remaining = countRemaining(tokens, pos);
    if (remaining !== lastNum) {
      num.textContent = String(remaining); lastNum = remaining;
      fill.style.width = (((TOTAL - remaining) / TOTAL) * 100).toFixed(1) + "%";
    }
    pglow.fill(0);
    for (let i = 0; i < TOTAL; i++) {
      const tk = tokens[i];
      const g = glow(pos, tk.start, tk.dur);
      const c = colorFor(g);
      if (tk._c !== c) { tk.el.style.color = c; tk._c = c; }
      if (g > pglow[tk.phrase]) pglow[tk.phrase] = g;
    }
    for (let pi = 0; pi < phrases.length; pi++) {
      const p = phrases[pi], g = pglow[pi], c = colorFor(g);
      if (p._c !== c) {
        p.el.style.color = c;
        p.el.style.opacity = g > 0.02 ? "1" : "0.32";
        p.el.classList.toggle("vk-en-on", g > 0.45);
        p._c = c;
      }
    }
  }

  // ---- transport (rAF, pause-safe, speed-safe) ----
  let playing = false, baseBeats = 0, segStart = 0, speed = 1, raf = null;
  const posNow = () => playing ? baseBeats + ((performance.now() - segStart) * speed) / cfg.beatMs : baseBeats;

  function loop() {
    const p = posNow();
    render(p);
    if (p > totalBeats + cfg.trail + 0.5) { playing = false; btnPlay.textContent = "▶ Play"; return; }
    raf = requestAnimationFrame(loop);
  }
  function play() {
    if (playing) return;
    if (baseBeats > totalBeats) baseBeats = 0;
    segStart = performance.now(); playing = true; btnPlay.textContent = "❚❚ Pause"; loop();
  }
  function pause() {
    if (!playing) return;
    baseBeats = posNow(); playing = false; cancelAnimationFrame(raf); btnPlay.textContent = "▶ Play";
  }
  function reset() { pause(); baseBeats = 0; lastNum = -1; render(0); }
  function destroy() { pause(); io && io.disconnect(); mount.innerHTML = ""; mount.classList.remove("vk"); }

  btnPlay.addEventListener("click", () => (playing ? pause() : play()));
  btnReset.addEventListener("click", () => { reset(); });
  spd.addEventListener("input", () => { const v = +spd.value; if (playing) { baseBeats = posNow(); segStart = performance.now(); } speed = v; });

  render(0);

  // pause automatically when the tab/panel is scrolled or toggled out of view
  let io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) if (!e.isIntersecting && playing) pause();
    }, { threshold: 0.05 });
    io.observe(mount);
  }

  if (cfg.autoplay) play();
  return { play, pause, reset, destroy };
}

// ---- site integration: mount once on first tab-show (called from src/main.js) ----
let _handle = null;
export function mountKaraoke() {
  const mount = document.getElementById("vk-mount");
  if (!mount) return null;
  if (!_handle) _handle = initVajraKaraoke(mount);
  return _handle;
}
export function getKaraoke() { return _handle; }
