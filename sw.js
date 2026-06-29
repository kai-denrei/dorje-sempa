/* Service worker for "The Path" — hand-rolled, no Workbox, scope "/".
 *
 * Cache name is keyed to the cache-bust token so every deploy invalidates the
 * old cache cleanly. The token below is rewritten by ./scripts/bust.sh on each
 * run (it replaces the value of CB_TOKEN), keeping it in lock-step with the
 * <meta name="cb"> tag and the ?v= fingerprints across the site.
 *
 *   - If you see CB_TOKEN = '__CB_TOKEN__' it means bust.sh has not run yet;
 *     the placeholder is the templated form. A real 8-hex token (e.g.
 *     'a5e09562') means it has been stamped.
 *   - On manual deploys, if for some reason bust.sh did not touch this file,
 *     bump CB_TOKEN by hand so the cache name changes.
 *
 * Precache holds the CANONICAL urls (no ?v=). The site links assets with a
 * ?v=<token> query; those fingerprinted variants are picked up by the runtime
 * stale-while-revalidate handler the first time they're requested. We keep the
 * precache lean: the two Tibetan fonts (~2MB each) are runtime-cached
 * (CacheFirst), not precached, so install stays fast.
 */

const CB_TOKEN = '59a52746'; // bust.sh rewrites this value on each build
const CACHE_NAME = `the-path-${CB_TOKEN}`;

// App shell: the three routes, the offline fallback, core CSS, the homepage JS,
// and the two data files the homepage + glossary read. Canonical URLs only.
const PRECACHE_URLS = [
  '/dorje-sempa/',
  '/dorje-sempa/glossary/',
  '/dorje-sempa/test.html',
  '/dorje-sempa/offline.html',
  '/dorje-sempa/styles/tokens.css',
  '/dorje-sempa/styles/typography.css',
  '/dorje-sempa/styles/main.css',
  '/dorje-sempa/src/main.js',
  '/dorje-sempa/src/quiz.js',
  '/dorje-sempa/src/quiz-scheduler.js',
  '/dorje-sempa/src/storage.js',
  '/dorje-sempa/styles/quiz.css',
  '/dorje-sempa/src/vajrasattva-recitation.js',
  '/dorje-sempa/styles/vajrasattva-recitation.css',
  '/dorje-sempa/data/glossary.json',
  '/dorje-sempa/data/concept-map.json',
  '/dorje-sempa/icons/icon-192.png',
  '/dorje-sempa/icons/icon-512.png',
  '/dorje-sempa/manifest.webmanifest',
];

const OFFLINE_URL = '/dorje-sempa/offline.html';

// ---- install: precache the app shell, but do NOT auto-activate ----
// skipWaiting happens only on a SKIP_WAITING message (see update flow in pwa.js),
// so an in-progress reader is never disrupted by a surprise activation.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // addAll is atomic-ish: any 404 rejects the whole install. Add individually
      // so one missing optional asset can't brick the whole precache.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn('[sw] precache skip', url, err);
          })
        )
      );
    })()
  );
});

// ---- activate: drop old caches, enable nav preload, take control ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

// ---- message: allow the page to trigger an immediate activation ----
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ---- fetch routing ----
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only ever handle same-origin GET. Everything else (cross-origin, POST, etc.)
  // falls through to the network untouched (NetworkOnly, never cached).
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Navigations (HTML documents): NetworkFirst, using the preload response,
  // falling back to cache, then the offline page.
  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  // Fonts: CacheFirst (immutable, long-lived).
  if (url.pathname.startsWith('/dorje-sempa/fonts/')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Everything else same-origin (CSS / JS / JSON / images, incl. ?v= variants):
  // StaleWhileRevalidate. The ?v= token changes the URL on each rebuild, so a
  // stale cached copy is only ever a same-token copy — safe to serve fast.
  event.respondWith(staleWhileRevalidate(req));
});

// NetworkFirst for navigations, with navigation preload + offline fallback.
async function handleNavigate(event) {
  const req = event.request;
  const cache = await caches.open(CACHE_NAME);
  try {
    // Use the preloaded response if navigationPreload gave us one.
    const preload = await event.preloadResponse;
    if (preload) {
      cache.put(req, preload.clone()).catch(() => {});
      return preload;
    }
    const fresh = await fetch(req);
    cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch (_) {
    // Offline: try the exact page from cache, then the route, then offline.html.
    const cached = (await cache.match(req)) || (await cache.match('/dorje-sempa/'));
    if (cached) return cached;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response('You are offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

// CacheFirst: serve from cache, else fetch + cache. Used for fonts.
async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch (err) {
    // No network, nothing cached — let the request fail naturally.
    return Response.error();
  }
}

// StaleWhileRevalidate: serve cache immediately, refresh in the background.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}
