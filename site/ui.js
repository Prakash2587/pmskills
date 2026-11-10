/* ============================================================================
 * PM Skills — behaviour every page shares.
 *   - Light / dark theme: follows the system until the visitor picks one, then
 *     remembers the pick. Loaded in <head> so the page never flashes the wrong one.
 *   - Copy feedback: the button itself turns green with a tick.
 *
 *   PMUI.themeToggle()        -> html for the switch (any [data-theme-toggle] works)
 *   PMUI.copy(text)           -> Promise
 *   PMUI.copied(button, text) -> flash the button as done
 * ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'pmskills.theme';
  var root = document.documentElement;
  var dark = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  function stored() { try { return global.localStorage.getItem(KEY); } catch (e) { return null; } }
  function system() { return dark && dark.matches ? 'dark' : 'light'; }
  function label(theme) { return theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'; }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    [].forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (b) {
      b.setAttribute('aria-label', label(theme)); b.setAttribute('title', label(theme));
    });
  }

  apply(stored() === 'dark' || stored() === 'light' ? stored() : system());

  // Follow the system only while the visitor has not chosen for themselves.
  if (dark && dark.addEventListener) dark.addEventListener('change', function () { if (!stored()) apply(system()); });

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { global.localStorage.setItem(KEY, next); } catch (e) { /* private browsing: the choice lasts for this page only */ }
    apply(next);
  });

  var ICONS =
    '<svg class="i-moon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
    '<svg class="i-sun" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M4.5 15.5l1.4-1.4M14.1 5.9l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  var TICK = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.6l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  global.PMUI = {
    tick: TICK,
    themeToggle: function () {
      var l = label(root.getAttribute('data-theme'));
      return '<button type="button" class="btn theme-toggle" data-theme-toggle aria-label="' + l + '" title="' + l + '">' + ICONS + '</button>';
    },
    /** Resolves once the text is on the clipboard; rejects if the browser refused both ways. */
    copy: function (text) {
      function legacy() {
        return new Promise(function (resolve, reject) {
          var ta = document.createElement('textarea'), ok = false;
          ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
          document.body.removeChild(ta);
          if (ok) resolve(); else reject(new Error('copy refused'));
        });
      }
      if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
        return global.navigator.clipboard.writeText(text).catch(legacy);
      }
      return legacy();
    },
    copied: function (btn, text) {
      if (!btn || btn._restore) return;
      var html = btn.innerHTML;
      btn.style.minWidth = btn.offsetWidth + 'px';   // the button must not jump when its label changes
      btn.classList.add('copied');
      btn.innerHTML = TICK + '<span>' + (text || 'Copied') + '</span>';
      btn._restore = global.setTimeout(function () {
        btn.classList.remove('copied');
        btn.innerHTML = html; btn.style.minWidth = ''; btn._restore = null;
      }, 1800);
    }
  };
})(window);
