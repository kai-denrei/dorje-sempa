/* In-page tabs (ARIA tabs pattern) for the homepage header.
   - A role="tablist" of role="tab" buttons, each controlling a role="tabpanel".
   - The Glossary "tab" is a real <a href="/glossary/"> (a route, not a panel),
     so activating it just navigates; it never participates in panel show/hide.
   - The active tab is reflected in location.hash (deep-linkable, Back/Forward
     aware). On load the hash selects the tab; default = The Path.
   - Keyboard: Left/Right move roving focus between tabs (wrapping), Home/End
     jump to first/last, Enter/Space activate. Visible focus is the CSS default.
   - prefers-reduced-motion is honored: panels just toggle [hidden]; the CSS
     entrance fade is disabled under reduced motion.
   - When an in-page tab becomes visible, an optional onShow(tabId) callback is
     fired so a viz that needs a real size (it was hidden, so width was 0) can
     redraw/resize on show. */

const DEFAULT_TAB = 'the-path';

/* Read the tab id from a hash like "#lineage" → "lineage". Returns '' if none. */
function tabFromHash() {
  const h = (location.hash || '').replace(/^#/, '').trim();
  return h;
}

export function mountTabs(opts = {}) {
  const onShow = typeof opts.onShow === 'function' ? opts.onShow : null;
  const tablist = document.querySelector('[role="tablist"]');
  if (!tablist) return;

  // In-page tabs are <button role="tab">; the Glossary tab is <a role="tab">.
  const allTabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  const pageTabs = allTabs.filter((t) => t.tagName !== 'A');   // panel-backed tabs
  if (!pageTabs.length) return;

  const idOf = (tab) => tab.dataset.tab;
  const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));
  const tabById = new Map(pageTabs.map((t) => [idOf(t), t]));

  /* Show the panel for `id`; hide the rest. Updates aria-selected/tabindex on
     ALL tabs (including the link, so the roving model stays consistent). Pushes
     the hash unless `replace` is set (used on the initial load so we don't add a
     spurious history entry). Fires onShow so viz can resize when revealed. */
  function activate(id, { focus = false, updateHash = true, replace = false } = {}) {
    const target = tabById.get(id);
    if (!target) return;

    allTabs.forEach((t) => {
      const selected = t === target;
      t.setAttribute('aria-selected', String(selected));
      // Roving tabindex across the whole tablist (link included).
      t.tabIndex = selected ? 0 : -1;
    });
    pageTabs.forEach((t) => {
      const panel = panelOf(t);
      if (panel) panel.hidden = t !== target;
    });

    if (focus) target.focus();

    if (updateHash) {
      const newHash = '#' + id;
      if (location.hash !== newHash) {
        if (replace) history.replaceState(null, '', newHash);
        else history.pushState(null, '', newHash);
      }
    }

    if (onShow) onShow(id);
  }

  /* Roving-focus keyboard model on the tablist. */
  tablist.addEventListener('keydown', (e) => {
    const idx = allTabs.indexOf(document.activeElement);
    if (idx === -1) return;
    let next = -1;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown': next = (idx + 1) % allTabs.length; break;
      case 'ArrowLeft':
      case 'ArrowUp':   next = (idx - 1 + allTabs.length) % allTabs.length; break;
      case 'Home':      next = 0; break;
      case 'End':       next = allTabs.length - 1; break;
      case 'Enter':
      case ' ':
      case 'Spacebar': {
        const cur = allTabs[idx];
        if (cur.tagName === 'A') return;          // let the link navigate
        e.preventDefault();
        activate(idOf(cur), { focus: true });
        return;
      }
      default: return;
    }
    if (next === -1) return;
    e.preventDefault();
    const dest = allTabs[next];
    // Move roving focus; do NOT auto-activate the link tab (it would navigate).
    dest.focus();
  });

  /* Click: in-page tabs activate; the Glossary <a> follows its href naturally. */
  pageTabs.forEach((t) => {
    t.addEventListener('click', (e) => {
      e.preventDefault();
      activate(idOf(t), { focus: false });
    });
  });

  /* Back/Forward (and manual hash edits) re-select the tab. The glossary route
     is a separate document, so its hash never reaches this listener. */
  window.addEventListener('hashchange', () => {
    const id = tabFromHash();
    if (tabById.has(id)) activate(id, { updateHash: false });
    else activate(DEFAULT_TAB, { updateHash: false });
  });

  /* Initial selection from the hash; default to The Path. Use replaceState so
     the first paint doesn't push a history entry. */
  const initial = tabById.has(tabFromHash()) ? tabFromHash() : DEFAULT_TAB;
  activate(initial, { updateHash: true, replace: true });
}
