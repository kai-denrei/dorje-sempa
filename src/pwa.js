/* PWA wiring — registers the service worker at scope "/" and shows a small,
 * non-blocking "new version" toast when an update is waiting. Tiny, no deps.
 *
 * Update flow (matches sw.js, which only skipWaiting()s on message):
 *   1. A new sw.js installs and parks in the "waiting" state.
 *   2. We surface a toast: "New version — refresh".
 *   3. Clicking it posts {type:'SKIP_WAITING'} to the waiting worker.
 *   4. The worker activates and fires controllerchange → we reload once.
 */

(function () {
  if (!('serviceWorker' in navigator)) return;

  const TOAST_ID = 'pwa-update-toast';
  const reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function showToast(waitingWorker) {
    if (!waitingWorker || document.getElementById(TOAST_ID)) return;

    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'New version — refresh';

    // Inline styles so the toast needs no external CSS (works even pre-cache).
    Object.assign(toast.style, {
      position: 'fixed',
      insetInlineEnd: '1rem',
      insetBlockEnd: '1rem',
      zIndex: '9999',
      maxWidth: 'calc(100vw - 2rem)',
    });
    Object.assign(btn.style, {
      font: '500 0.95rem/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      color: '#f6f2e9',
      background: '#7a3a31',
      border: '1px solid #5a2922',
      borderRadius: '8px',
      padding: '0.7rem 1.1rem',
      cursor: 'pointer',
      boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
      transition: reduceMotion ? 'none' : 'transform 120ms ease, opacity 120ms ease',
    });
    if (!reduceMotion) {
      btn.style.opacity = '0';
      btn.style.transform = 'translateY(8px)';
    }

    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Updating…';
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    });

    toast.appendChild(btn);
    document.body.appendChild(toast);

    if (!reduceMotion) {
      // next frame: animate in
      requestAnimationFrame(() => {
        btn.style.opacity = '1';
        btn.style.transform = 'translateY(0)';
      });
    }
  }

  // Reload exactly once when the new worker takes control.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Already waiting (installed in a previous visit)?
        if (reg.waiting && navigator.serviceWorker.controller) {
          showToast(reg.waiting);
        }

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // A new worker finished installing while a controller exists →
            // it's an update (not the first install). Offer the refresh.
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              showToast(reg.waiting || installing);
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[pwa] SW registration failed', err);
      });
  });
})();
