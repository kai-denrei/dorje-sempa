/* Quiz persistence — the app's first client-side storage layer. Isolated here so
   the rest of the app stays storage-free. The backend is injectable so the pure
   logic is testable without a real localStorage; in the browser it defaults to a
   safe localStorage wrapper that falls back to in-memory under private mode /
   quota / unavailability. State shape: { v, terms: { [id]: {bucket, seen, lastSeen} } }. */

export const STORAGE_KEY = 'dorje-sempa:quiz:v1';
export const SCHEMA_VERSION = 1;

/* An in-memory backend with the localStorage getItem/setItem/removeItem shape.
   Used both as the private-mode fallback and as the test backend. */
export function memoryBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/* Real localStorage if it works (a write probe catches private-mode throwers),
   otherwise an in-memory backend so the quiz still runs for the session. */
export function safeBackend() {
  try {
    const ls = globalThis.localStorage;
    const probe = '__dw_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch (_) {
    return memoryBackend();
  }
}

function emptyState() {
  return { v: SCHEMA_VERSION, terms: {} };
}

export function createQuizStore(backend = safeBackend(), now = () => Date.now()) {
  let state = read();

  function read() {
    try {
      const raw = backend.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== SCHEMA_VERSION || typeof parsed.terms !== 'object' || !parsed.terms) {
        return emptyState();
      }
      return { v: SCHEMA_VERSION, terms: parsed.terms };
    } catch (_) {
      return emptyState();
    }
  }

  function persist() {
    try {
      backend.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      /* quota / unavailable: keep working from in-memory `state` this session */
    }
  }

  return {
    load() { state = read(); return state.terms; },
    getProgress() { return state.terms; },
    recordGrade(id, bucket, ts = now()) {
      const prev = state.terms[id] || { bucket: 0, seen: 0, lastSeen: 0 };
      const entry = { bucket, seen: prev.seen + 1, lastSeen: ts };
      state.terms[id] = entry;
      persist();
      return entry;
    },
    knownCount() {
      return Object.values(state.terms).filter((e) => e && e.bucket === 2).length;
    },
    reset() { state = emptyState(); persist(); },
  };
}
