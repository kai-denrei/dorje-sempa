# Quiz Tab — Design Spec

**Date:** 2026-06-29
**Status:** Approved (brainstorming complete) — ready for implementation plan
**Project:** Dorje Sempa (static Karma Kagyu / Diamond Way glossary PWA, served at `/dorje-sempa/`)

---

## 1. Summary

Add a **Quiz** tab that turns the existing 67-term glossary into a self-graded,
spaced-repetition flashcard drill. The card shows a term (Tibetan glyph +
transliteration); the user recalls the meaning, flips to reveal the `gloss`, and
self-rates recall on a 3-level scale (Red / Orange / Green → a 3-bucket Leitner
scheduler). Familiarity is persisted across visits so unfamiliar terms resurface
for review.

The feature is purely additive: it reuses the existing glossary data, tab
architecture, term store, and design tokens. No backend, no new data file, no new
dependency.

---

## 2. Goals & non-goals

### Goals
- Active-recall study of the glossary: see term → recall → reveal → self-grade.
- "Remember what I don't know": persist per-term familiarity and prioritise
  unfamiliar terms for review.
- Calm, contemplative tone consistent with the app — no streaks, XP, or leagues.
- Fully offline-capable (PWA) and accessible (keyboard, reduced-motion, screen
  reader, color-independent grading).

### Non-goals (YAGNI — explicitly out of scope for v1)
- SM-2 / FSRS or any day-based ("review in 3 days") scheduling. Sessions are
  self-paced sittings, not a daily-streak SRS habit.
- Streaks, XP, points, leagues, or any competitive gamification.
- A separate quiz data file — the quiz reads `data/glossary.json`.
- Typed-answer / multiple-choice / audio modes. v1 is flip-card self-grade only.

---

## 3. Data reality (verified)

Source: `data/glossary.json` (schema v1, loaded at `/dorje-sempa/data/glossary.json`).
67 terms across 6 categories — foundation 9, concept 18, practice 21, lineage 11,
institution 6, script 2.

| field | coverage | role in quiz |
|---|---|---|
| `id` | 100% | stable localStorage key for per-term progress |
| `phonetic` | 100% | display headword / pronunciation (front, all terms) |
| `wylie` | 100% | ASCII transliteration (front, all terms) |
| `gloss` | 100% | **the answer** (back); render via `glossHtml()` |
| `category` | 100% | filter chips on the start screen |
| `tibetan` | ~42/67 | Tibetan glyph headword when present |
| `tibetanVerified` | 100% | bool; some glyphs unverified (Wylie is authoritative) |
| `sanskrit` | 10/67 | optional IAST headword for Sanskrit-primary terms |
| `primary` | default `tibetan` | which form is the headword: tibetan/sanskrit/english |
| `keywords` | 16/67 | not used in v1 |

**Decision (deck scope): include all 67 terms.** The ~25 terms with no Tibetan
glyph (Sanskrit/English concept terms) fall back to `phonetic`/`sanskrit` as the
headword. The front is gated on `hasTibetan(t)` (`src/terms.js`) to decide whether
to render the glyph.

**Answer-leak note:** some `gloss` strings bold the term itself (`*...*`). Because
the chosen direction is *term → meaning* (the term is the question, already on the
front), this is **not** a leak. The `gloss` is still always rendered through
`glossHtml()` (XSS-escape + `*...*`→`<strong>`), never injected raw.

---

## 4. User experience

### 4.1 Start screen (quiz panel, before a session)
- Heading + one-line intro.
- **"Review unfamiliar (N)"** — builds a deck of Red + Orange terms (the ones the
  user has graded as not-yet-known). Shown prominently when N > 0.
- **Category filter chips** — foundation / concept / practice / lineage /
  institution / script. Selecting chips scopes the deck. Default: all categories.
- **"Start (M terms)"** — begins a session over the current selection.
- A quiet, persistent line: **"Terms you know well: X / 67."**

### 4.2 The card loop (recall-first)
1. **Front** renders the term:
   - Tibetan glyph (`.tib-display`) when `hasTibetan(t)`, else phonetic/Sanskrit.
   - Transliteration line: `wylie` (`.wylie`) and `phonetic` (`.phonetic`).
   - Small category chip for context.
   - A single **Reveal** button (the flip trigger).
2. The user attempts recall silently, then reveals. **Grade buttons are hidden
   until reveal** — enforcing a genuine retrieval attempt (the testing effect).
3. **Back** renders the answer: `gloss` via `glossHtml()`, plus the full headword
   set (Tibetan + Wylie + phonetic + Sanskrit) so the user sees every form.
4. **Three self-grade buttons** appear:
   - **Didn't come** (maroon/`--warn`) · **Needed effort** (`--saffron`) ·
     **Knew it** (green/`--ok`).
   - Earth-tone palette from existing tokens. Each carries a **text label + a
     distinct shape/icon**, never color alone (WCAG 1.4.1).
5. Grading advances to the next card.

### 4.3 End-of-session summary
A calm recap: "Reviewed N · Know well X · Still shaky Y · Unfamiliar Z." Plus
options to **review the still-shaky set again** or **return to the start screen**.
No streak count, no score.

---

## 5. Scheduler — 3-bucket Leitner

**Decision (algorithm): 3-bucket Leitner.** Confirmed by research as the right fit
for short, offline, no-backend, streak-free sessions. Keep **3 grades** (4+ grades
cause dishonest middle-grade guessing; the 3-color rating *is* a 3-box Leitner).
SM-2/FSRS rejected (day-based scheduling is meaningless in a single sitting; FSRS
needs ~1000+ logged reviews — pure overhead at 67 terms).

### Bucket model
- `bucket`: `0` Red (unfamiliar / never-seen) · `1` Orange (shaky) · `2` Green
  (known). A term with no saved state is treated as bucket `0` (due).

### Grade → transition
| grade | new bucket |
|---|---|
| Didn't come | `0` (Red) |
| Needed effort | `1` (Orange) |
| Knew it | `min(bucket+1, 2)` → effectively `2` (Green) |

(Transitions live in the pure scheduler module and are unit-tested; exact
increment policy — e.g. whether "Knew it" jumps straight to Green or steps up — is
finalised in the plan, but the default is: Didn't come → 0, Needed effort → 1,
Knew it → 2.)

### Within-session queue
- **Red** → reinsert ~4 cards ahead (resurfaces in the same sitting).
- **Orange** → move to the back of the current pass.
- **Green** → drop from this session's queue.
- Session ends when the queue is empty.

### Across sessions
- Buckets persist in localStorage. The start screen's "Review unfamiliar (N)"
  reads Red + Orange counts. Greens park and resurface only when the user chooses
  "All" or has cleared the rest. No time-decay in v1 (a later increment could add
  gentle decay so long-parked Greens reappear).

---

## 6. Architecture & files

The quiz is split into three small modules with clear boundaries: pure scheduling
logic, an isolated persistence layer, and the DOM/interaction layer. This keeps the
testable logic free of the DOM and confines the app's first storage layer to one
file.

| File | New? | Responsibility | Depends on |
|---|---|---|---|
| `src/quiz-scheduler.js` | new | **Pure** logic: bucket transitions, within-session requeue order, deck building from filters. No DOM, no storage → directly unit-testable. | — |
| `src/storage.js` | new | The app's first persistence layer. Read/write a single versioned key; graceful failure on private-mode/quota; `term.id` as stable key. | — |
| `src/quiz.js` | new | DOM + interaction: start screen, card render, reveal/flip, grade handling, session summary. Exports `mountQuiz()`. | `terms.js`, `quiz-scheduler.js`, `storage.js` |
| `styles/quiz.css` | new | Card surface + flip faces + grade buttons + start screen. Built **only** from existing tokens. | `tokens.css` |
| `index.html` | edit | Add tab button (after Practices, before the Glossary link) + `#panel-quiz` panel (`hidden`); add `<link>` for `quiz.css` and `<script type="module">`/import wiring. | — |
| `src/main.js` | edit | Import `mountQuiz`; mount lazily the first time `#quiz` is shown (mirror the lineage-viz first-show pattern via the `onShow()` hook). | `quiz.js` |
| `sw.js` | edit | Add `src/quiz.js`, `src/quiz-scheduler.js`, `src/storage.js`, `styles/quiz.css` to `PRECACHE_URLS` for offline. | — |

`src/tabs.js` requires **no change** — it auto-discovers any `[role="tab"]` /
`[role="tabpanel"]` and wires roving focus, hash routing (`#quiz`), and
Back/Forward.

**Cache-busting:** new `<script>` / `<link>` references must be picked up by
`scripts/bust.sh` + `fingerprint-urls.py` so they receive the `?v=<token>`
fingerprint; otherwise they go stale on deploy.

---

## 7. Persistence schema

```js
// localStorage key: "dorje-sempa:quiz:v1"
{
  v: 1,
  terms: {
    "kagyu":  { bucket: 2, seen: 4, lastSeen: 1782693803867 },
    "phowa":  { bucket: 0, seen: 1, lastSeen: 1782693900000 }
    // ... only terms the user has actually graded are stored
  }
}
```

- `bucket` drives scheduling; `seen` and `lastSeen` are for ordering/summary only
  (no day-based scheduling).
- Reads/writes go through `storage.js`, which:
  - returns a safe empty state if storage is unavailable (private mode) or parse
    fails;
  - swallows quota errors on write (the quiz keeps working in-memory for the
    session);
  - validates `v`; on an unknown future version, ignores the stored blob rather
    than crashing.
- **Migration:** if a `term.id` changes in `glossary.json`, that term's progress
  silently resets (acceptable — no migration layer in v1).

---

## 8. Accessibility

- **Flip control** is a real `<button>`; both faces exist in the DOM with
  `aria-hidden` / `tabindex` toggled so only the visible face is reachable.
- On reveal, **focus moves to the answer / first grade button** (more reliable
  than `aria-live` for announcing the flip).
- `prefers-reduced-motion`: no 3D flip animation — faces swap instantly (honors
  the app's existing reduced-motion baseline).
- Tap targets ≥ 44px; grade encoded by **label + icon + color**, never color
  alone.
- Keyboard: `Space` / `Enter` reveals; `1` / `2` / `3` grade the three levels.
  The global `focus-visible` (2px `--indigo`) ring already applies.

---

## 9. Testing

`quiz-scheduler.js` and `storage.js` are pure / isolated and get **unit tests
first** (TDD) in the existing in-browser harness (`test.html` / `src/test.js`):

- bucket transitions for each grade;
- within-session requeue ordering (Red resurfaces, Orange to back, Green drops);
- deck building from category filters and from the "unfamiliar" set;
- persistence round-trip (write → read → equal);
- graceful degradation when `localStorage` throws / is absent;
- schema-version guard.

The DOM/interaction layer (`quiz.js`) is verified by running the app: reveal flow,
keyboard grading, reduced-motion swap, offline load, and that the new tab routes on
`#quiz`.

---

## 10. Risks & mitigations

| risk | mitigation |
|---|---|
| ~25 terms have empty `tibetan` → blank glyph cards | Gate the glyph on `hasTibetan(t)`; fall back to phonetic/Sanskrit headword. |
| New assets not cached offline / go stale | Add all 4 new files to `PRECACHE_URLS` (`sw.js`); ensure `bust.sh` fingerprints the new `<link>`/`<script>`. |
| First-ever storage layer, no pattern to copy | Isolate in `storage.js`; version the schema; handle private-mode/quota failures; treat `term.id` as the stable key. |
| Tibetan glyphs are large (~48px) → cramped flip cards | Reserve card height; respect `line-height`/tsheg; keep decorative syllable-coloring out of the quiz. |
| Scope creep toward full SRS | Hold the line at §2 non-goals: glossary.json + 3-bucket Leitner + localStorage + flip card. Everything else is a later increment. |

---

## 11. Open decisions — resolved

| decision | choice |
|---|---|
| Deck scope / non-Tibetan terms | **All 67**, mixed headword, **+ category filter** on the start screen. |
| Rating UI | **Earth-tone buttons + text labels** (calm palette, accessible), keeping 3 levels. |
| Memory | **Persist across visits** via localStorage (app's first storage layer). |
| Progress / tone | **Calm progress, no game** — within-session n-of-N + "terms you know well: X/67" tally; no streaks/XP. |
