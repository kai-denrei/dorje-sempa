/* vajrasattva-recitation.js
   Recitations — a karaoke-style mantra recitation widget for the Dorje Sempa
   site. A dark surface where syllables light orange left-to-right at chant pace,
   a small white countdown trails the final syllable, and the per-phrase English
   gloss lights in sync. A single persistent control bar (text selector · play ·
   restart · pace · rounds) drives a swappable body, so several recitations share
   one engine. Vanilla ES module, no deps, no build. All DOM scoped under .vk.

   Mounted on tab-show via src/main.js; no window global, no auto-init.
   Syllable entries are "GA" (1 beat) or ["KAYO", 2] (held N beats).
   Public API:
     YIGGYA, RECITATIONS            the verified data (default + the full set)
     flattenTokens(recitation)      pure → { tokens, totalBeats }
     countRemaining(tokens, pos)    pure → colorable units not yet completed
     initRecitations(mount, opts)   build the widget → { play, pause, reset, destroy, loadText }
     mountRecitation()              idempotent: init once into #vk-mount → handle
     getRecitation()                the live handle (or null) */

// ---------------------------------------------------------------- data ----
export const YIGGYA = [
  { en: "(seed sound)",                         words: [["OM"]] },
  { en: "Vajra-Being — the deity addressed",    words: [["BEN","ZA"],["SA","TO"]] },
  { en: "uphold the sacred bond (samaya)",      words: [["SA","MA","YA"],["MA","NU"],["PA","LA","YA"]] },
  { en: "O Vajra-Being",                        words: [["BEN","ZA"],["SA","TO"]] },
  { en: "remain present through your very nature", words: [["TE","NO"],["PA"],["TI","TTHA"]] },
  { en: "be steadfast toward me",               words: [["DRI"],["DHO"],["MEY"],["BHA","WA"]] },
  { en: "be well-pleased with me",              words: [["SU","TO"],[["KAYO",2]],["MEY"],["BHA","WA"]] },
  { en: "nourish me well / make me thrive",     words: [["SU","PO"],[["KAYO",2]],["MEY"],["BHA","WA"]] },
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

const MANI = [
  { en: "OM · purifies pride · closes the god realm · generosity",          words: [["OM"]] },
  { en: "MA · purifies jealousy · the demigod realm · discipline",          words: [["MA"]] },
  { en: "NI · purifies desire-attachment · the human realm · patience",     words: [["NI"]] },
  { en: "PAD · purifies ignorance · the animal realm · diligence",          words: [["PAD"]] },
  { en: "ME · purifies greed · the hungry-ghost realm · concentration",     words: [["ME"]] },
  { en: "HUM · purifies aggression · the hell realm · wisdom",              words: [["HUM"]] },
];

const VAJRA_GURU = [
  { en: "body, speech & mind of all buddhas — the three vajras",   words: [["OM"],["AH"],["HUM"]] },
  { en: "VAJRA — indestructible, adamantine truth",                words: [["VAJ","RA"]] },
  { en: "GURU — the teacher, Padmasambhava, laden with qualities", words: [["GU","RU"]] },
  { en: "PADMA — the lotus, awakened speech (Amitābha family)",    words: [["PAD","MA"]] },
  { en: "SIDDHI — grant the attainments, ordinary and supreme",    words: [["SID","DHI"]] },
  { en: "HUM — the heart-essence — so be it accomplished",         words: [["HUM"]] },
];

const GREEN_TARA = [
  { en: "OM — body, speech & mind of all the awakened",             words: [["OM"]] },
  { en: "TARE — swift liberator · freedom from cyclic suffering",   words: [["TA","RE"]] },
  { en: "TUTTARE — freedom from the eight fears & outer dangers",   words: [["TU","TTA","RE"]] },
  { en: "TURE — freedom from disease · swiftly bestowing the path", words: [["TU","RE"]] },
  { en: "SVAHA — rooted in the heart · so be it",                   words: [["SVA","HA"]] },
];

const GATE = [
  { en: "gone",                  words: [["GA","TE"]] },
  { en: "gone — further",        words: [["GA","TE"]] },
  { en: "gone beyond",           words: [["PA","RA","GA","TE"]] },
  { en: "gone wholly beyond",    words: [["PA","RA","SAM","GA","TE"]] },
  { en: "awakening",             words: [["BO","DHI"]] },
  { en: "be it so established",  words: [["SVA","HA"]] },
];

const MEDICINE = [
  { en: "TADYATHA — namely, it runs thus",                       words: [["TAD","YA","THA"]] },
  { en: "OM — seed of awakened body, speech, mind",              words: [["OM"]] },
  { en: "BEKANDZE — O eliminator of pain · of sickness itself",  words: [["BE","KAN","DZE"]] },
  { en: "BEKANDZE — O eliminator of pain · of its inner causes", words: [["BE","KAN","DZE"]] },
  { en: "MAHA BEKANDZE — great eliminator · of the subtlest imprints", words: [["MA","HA"],["BE","KAN","DZE"]] },
  { en: "RADZA — O King of Healing",                             words: [["RA","DZA"]] },
  { en: "SAMUDGATE — fully arisen · let healing come forth",     words: [["SA","MUD","GA","TE"]] },
  { en: "SOHA — so be it established",                           words: [["SO","HA"]] },
];

const MAHAKALA = [
  { en: "OM — seed of awakened body, speech, mind",                      words: [["OM"]] },
  { en: "SHRI — glorious (honorific)",                                   words: [["SHRI"]] },
  { en: "MAHAKALA — Great Black One / Great Time · wrathful compassion", words: [["MA","HA","KA","LA"]] },
  { en: "HUM — wrathful heart-seed · be invoked",                        words: [["HUM"]] },
  { en: "PHAT — cut through obstacles · seal the activity",              words: [["PHAT"]] },
];

/* Ordered set shown in the selector. `note` (optional) renders a framing line in
   the body; `beatMs` is the per-recitation chant pace at speed 1. */
export const RECITATIONS = [
  { key: "vajrasattva", name: "Vajrasattva · yig-gya",            data: YIGGYA,      beatMs: 300 },
  { key: "mani",        name: "Avalokiteśvara · Oṃ Maṇi Padme Hūṃ", data: MANI,      beatMs: 820 },
  { key: "vajraguru",   name: "Padmasambhava · Vajra Guru",       data: VAJRA_GURU,  beatMs: 450 },
  { key: "tara",        name: "Green Tārā",                       data: GREEN_TARA,  beatMs: 500 },
  { key: "heart",       name: "Heart Sūtra · Gate Gate",          data: GATE,        beatMs: 420 },
  { key: "medicine",    name: "Medicine Buddha · Bhaiṣajyaguru",  data: MEDICINE,    beatMs: 400 },
  { key: "mahakala",    name: "Mahākāla · short mantra",          data: MAHAKALA,    beatMs: 450,
    note: "The publicly-transmitted short mantra, shown for study. The full Mahākāla practice is samaya-bound — it requires empowerment (wang) and reading-transmission (lung) from a qualified teacher, undertaken within a committed lineage relationship." },
];

const FOOTNOTE = "Romanized phonetic forms; counts and per-syllable glosses follow common conventions and vary by lineage and recension.";
const ROUND_PRESETS = [1, 7, 21, 100, 108];

// ------------------------------------------------------------ pure helpers ----
const textOf  = (e) => (Array.isArray(e) ? e[0] : e);
const beatsOf = (e) => (Array.isArray(e) ? e[1] : 1);

/* Pure: flatten phrase/word/syllable data to a timed token list. An entry is a
   plain string (1 beat) or a [text, beats] pair (held N beats). Returns the token
   list (one per colorable unit) and the total beat span. */
export function flattenTokens(recitation) {
  const tokens = [];
  let beat = 0;
  recitation.forEach((ph, pi) => {
    ph.words.forEach((word) => word.forEach((entry) => {
      const dur = beatsOf(entry);
      tokens.push({ text: textOf(entry), phrase: pi, start: beat, dur, end: beat + dur, el: null, _c: "" });
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

// ---------------------------------------------------------------- widget ----
export function initRecitations(mount, opts = {}) {
  const cfg = { attack: 0.35, trail: 3.0, sungFloor: 0, ...opts };
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  mount.classList.add("vk");
  mount.innerHTML = "";

  // ---- persistent control bar (top) ----
  const bar = el("div", "vk-controls");
  const btnPlay = el("button", "vk-btn vk-icon"); btnPlay.type = "button"; btnPlay.textContent = "▶"; btnPlay.setAttribute("aria-label", "Play");
  const btnReset = el("button", "vk-btn vk-icon"); btnReset.type = "button"; btnReset.textContent = "↺"; btnReset.setAttribute("aria-label", "Restart");

  const sel = el("select", "vk-select"); sel.setAttribute("aria-label", "Choose recitation");
  RECITATIONS.forEach((r) => { const o = document.createElement("option"); o.value = r.key; o.textContent = r.name; sel.appendChild(o); });

  const spd = el("input", "vk-pace"); spd.type = "range"; spd.min = "0.5"; spd.max = "1.6"; spd.step = "0.05"; spd.value = "1"; spd.setAttribute("aria-label", "Pace");

  const roundsSel = el("select", "vk-rounds"); roundsSel.setAttribute("aria-label", "Repetitions");
  ROUND_PRESETS.forEach((n) => { const o = document.createElement("option"); o.value = String(n); o.textContent = "×" + n; roundsSel.appendChild(o); });
  const roundNow = el("span", "vk-round"); roundNow.hidden = true;

  bar.append(btnPlay, btnReset, sel, spd, roundsSel, roundNow);

  // ---- swappable body ----
  const body = el("div", "vk-body");
  mount.append(bar, body);

  // ---- per-recitation state (rebuilt by buildBody) ----
  let current, tokens, totalBeats, phrases, TOTAL, num, pglow = [], lastNum = -1;

  // ---- transport state ----
  let playing = false, baseBeats = 0, segStart = 0, speed = 1, raf = null;
  let round = 1, targetRounds = 1;

  // color model: neutral(white) -> fade(dark orange) -> on(bright orange)
  const colorFor = (g) => {
    if (g <= 0.002) return "var(--vk-neutral)";
    if (g >= 0.998) return "var(--vk-on)";
    if (g < 0.5) { const t = g / 0.5;
      return `color-mix(in oklch, var(--vk-neutral) ${((1-t)*100).toFixed(1)}%, var(--vk-fade) ${(t*100).toFixed(1)}%)`; }
    const t = (g - 0.5) / 0.5;
    return `color-mix(in oklch, var(--vk-fade) ${((1-t)*100).toFixed(1)}%, var(--vk-on) ${(t*100).toFixed(1)}%)`;
  };
  // glow envelope: quick attack, hold across the (possibly long) beat, slow decay tail
  const glow = (pos, start, dur) => {
    if (pos < start - cfg.attack) return 0;
    if (pos < start) return (pos - (start - cfg.attack)) / cfg.attack;
    const end = start + dur;
    if (pos <= end) return 1;
    const d = (pos - end) / cfg.trail;
    return d >= 1 ? cfg.sungFloor : cfg.sungFloor + (1 - cfg.sungFloor) * (1 - d);
  };

  function buildBody(rec) {
    current = rec;
    const flat = flattenTokens(rec.data);
    tokens = flat.tokens; totalBeats = flat.totalBeats; TOTAL = tokens.length;
    phrases = rec.data.map((ph) => ({ en: ph.en, el: null, _c: "" }));
    pglow = new Array(phrases.length);
    lastNum = -1;

    body.innerHTML = "";
    num = el("span", "vk-count"); num.textContent = String(TOTAL);

    const sylWrap = el("div", "vk-syllables");
    rec.data.forEach((ph) => {
      const pEl = el("span", "vk-phrase");
      ph.words.forEach((word) => {
        const wEl = el("span", "vk-word");
        word.forEach((entry) => { const s = el("span", "vk-syl"); s.textContent = textOf(entry); wEl.appendChild(s); });
        pEl.appendChild(wEl);
      });
      sylWrap.appendChild(pEl);
    });
    sylWrap.appendChild(num);   // the countdown trails the final syllable, inline

    const glossWrap = el("div", "vk-gloss");
    phrases.forEach((p) => { const g = el("div", "vk-en"); g.textContent = p.en; glossWrap.appendChild(g); p.el = g; });

    body.append(sylWrap, glossWrap);
    if (rec.note) { const n = el("p", "vk-note"); n.textContent = rec.note; body.append(n); }
    const foot = el("p", "vk-foot"); foot.textContent = FOOTNOTE; body.append(foot);

    // bind token elements (DOM built in the same nested order as `tokens`)
    const sylEls = sylWrap.querySelectorAll(".vk-syl");
    tokens.forEach((tk, i) => { tk.el = sylEls[i]; });
  }

  const posNow = () => (playing ? baseBeats + ((performance.now() - segStart) * speed) / current.beatMs : baseBeats);

  function render(pos) {
    const remaining = countRemaining(tokens, pos);
    if (remaining !== lastNum) { num.textContent = String(remaining); lastNum = remaining; }
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

  function setPlayIcon(on) { btnPlay.textContent = on ? "❚❚" : "▶"; btnPlay.setAttribute("aria-label", on ? "Pause" : "Play"); }
  function updateRoundLabel() {
    if (targetRounds > 1) { roundNow.hidden = false; roundNow.textContent = round + "/" + targetRounds; }
    else { roundNow.hidden = true; }
  }

  function loop() {
    const p = posNow();
    render(p);
    if (p > totalBeats + cfg.trail + 0.5) {
      if (round < targetRounds) { round++; baseBeats = 0; segStart = performance.now(); updateRoundLabel(); }
      else { playing = false; setPlayIcon(false); return; }
    }
    raf = requestAnimationFrame(loop);
  }
  function play() {
    if (playing) return;
    if (baseBeats > totalBeats) { baseBeats = 0; round = 1; updateRoundLabel(); }
    segStart = performance.now(); playing = true; setPlayIcon(true); loop();
  }
  function pause() {
    if (!playing) return;
    baseBeats = posNow(); playing = false; cancelAnimationFrame(raf); setPlayIcon(false);
  }
  function reset() { pause(); baseBeats = 0; round = 1; lastNum = -1; updateRoundLabel(); render(0); }
  function destroy() { pause(); io && io.disconnect(); mount.innerHTML = ""; mount.classList.remove("vk"); }

  function loadText(key) {
    pause();
    buildBody(RECITATIONS.find((r) => r.key === key) || RECITATIONS[0]);
    baseBeats = 0; round = 1; lastNum = -1;
    updateRoundLabel(); render(0);
  }

  btnPlay.addEventListener("click", () => (playing ? pause() : play()));
  btnReset.addEventListener("click", () => reset());
  spd.addEventListener("input", () => { const v = +spd.value; if (playing) { baseBeats = posNow(); segStart = performance.now(); } speed = v; });
  sel.addEventListener("change", () => loadText(sel.value));
  roundsSel.addEventListener("change", () => { targetRounds = +roundsSel.value || 1; round = 1; updateRoundLabel(); });

  buildBody(RECITATIONS[0]);
  render(0);

  // pause automatically when the tab/panel is scrolled or toggled out of view
  let io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) if (!e.isIntersecting && playing) pause();
    }, { threshold: 0.05 });
    io.observe(mount);
  }

  return { play, pause, reset, destroy, loadText };
}

// ---- site integration: mount once on first tab-show (called from src/main.js) ----
let _handle = null;
export function mountRecitation() {
  const mount = document.getElementById("vk-mount");
  if (!mount) return null;
  if (!_handle) _handle = initRecitations(mount);
  return _handle;
}
export function getRecitation() { return _handle; }
