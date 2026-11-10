/* ============================================================================
 * PM Skills wizard shell — skill-agnostic.
 *
 * A skill's tool is a definition object handed to PMWizard.mount():
 *
 *   PMWizard.mount({
 *     id: 'cost-capacity',              // storage key — one saved session per tool
 *     version: 1,                       // bump to discard incompatible saved sessions
 *     brand: { mark, title, sub },
 *     header: [{ label, act }],         // extra header buttons
 *     hint: state => 'footer text',
 *     initialState: () => ({ step: 0, ... }),
 *     steps: [{ id, title, render(el, api), canAdvance(state), onEnter(state) }],
 *     actions: { name(el, api, event) },
 *     onDone: api => {}
 *   });
 *
 * Markup wires itself to actions with data attributes — no inline handlers:
 *   data-act="name"      click
 *   data-change="name"   change
 *   data-input="name"    input
 *   data-enter="name"    Enter key
 *   data-drag-id="x" inside data-drop="name"   drag to reorder → actions.name({from, to}, api)
 *
 * State is saved to localStorage on every change and restored on load, so a
 * visitor who leaves to sign up for Zoho Projects finds their plan waiting.
 * ========================================================================== */
(function (global) {
  'use strict';

  var def, state, root, storeKey, dragId = null, toastTimer = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(storeKey);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      return saved && saved.v === def.version ? saved.state : null;
    } catch (e) { return null; }
  }
  function save() {
    try {
      global.localStorage.setItem(storeKey, JSON.stringify({ v: def.version, at: new Date().toISOString(), state: state }));
    } catch (e) { /* private browsing: the session simply is not kept */ }
  }

  function $(id) { return document.getElementById(id); }

  function enter() {
    var step = def.steps[state.step];
    if (step && step.onEnter) step.onEnter(state, api);
  }

  function refreshNav() {
    var step = def.steps[state.step];
    var last = state.step === def.steps.length - 1;
    $('wz-back').disabled = state.step === 0;
    $('wz-next').disabled = step.canAdvance ? !step.canAdvance(state) : false;
    $('wz-next').textContent = last ? (def.doneLabel || 'Done') : 'Next →';
    $('wz-hint').innerHTML = def.hint ? def.hint(state) : '';
  }

  function render() {
    $('wz-stepper').style.gridTemplateColumns = 'repeat(' + def.steps.length + ', 1fr)';
    $('wz-stepper').innerHTML = def.steps.map(function (s, i) {
      var cls = i < state.step ? 'done' : (i === state.step ? 'active' : '');
      return '<div class="step ' + cls + '"' + (i < state.step ? ' data-shell="go" data-i="' + i + '"' : '') +
        '><div class="num">' + (i + 1) + '</div><div>' + esc(s.title) + '</div></div>';
    }).join('');
    def.steps[state.step].render($('wz-panel'), api);
    refreshNav();
  }

  function go(i) {
    if (i < 0 || i >= def.steps.length) return;
    state.step = i;
    enter();
    save();
    render();
    global.scrollTo(0, 0);
  }

  var api = {
    get state() { return state; },
    esc: esc,
    /** Mutate state, save, re-render the step. */
    set: function (fn) { fn(state); save(); render(); },
    /** Mutate state and save WITHOUT re-rendering — for fields being typed in. */
    patch: function (fn) { fn(state); save(); refreshNav(); },
    go: go,
    next: function () {
      var step = def.steps[state.step];
      if (step.canAdvance && !step.canAdvance(state)) return;
      if (state.step === def.steps.length - 1) { if (def.onDone) def.onDone(api); return; }
      go(state.step + 1);
    },
    back: function () { go(state.step - 1); },
    modal: function (html) { $('wz-modal').innerHTML = html; $('wz-mask').classList.add('on'); },
    closeModal: function () { $('wz-mask').classList.remove('on'); },
    toast: function (msg) {
      var t = $('wz-toast');
      t.textContent = msg; t.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.classList.remove('on'); }, 1900);
    },
    download: function (name, text, mime) {
      var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8;' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    },
    csv: function (rows) {
      return rows.map(function (r) {
        return r.map(function (cell) {
          var s = String(cell == null ? '' : cell);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
      }).join('\n');
    },
    copy: function (text) {
      if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
        return global.navigator.clipboard.writeText(text);
      }
      return new Promise(function (resolve) {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) { /* nothing more to try */ }
        document.body.removeChild(ta); resolve();
      });
    },
    reset: function () {
      if (!global.confirm('Start over? This clears everything you have entered in this tool.')) return;
      state = def.initialState();
      enter(); save(); render();
    }
  };

  function act(attr, ev) {
    var el = ev.target.closest('[' + attr + ']');
    if (!el || !root.contains(el)) return false;
    var fn = def.actions[el.getAttribute(attr)];
    if (fn) fn(el, api, ev);
    return true;
  }

  function wire() {
    root.addEventListener('click', function (ev) {
      var shell = ev.target.closest('[data-shell]');
      if (shell) {
        var what = shell.getAttribute('data-shell');
        if (what === 'next') api.next();
        else if (what === 'back') api.back();
        else if (what === 'reset') api.reset();
        else if (what === 'close') api.closeModal();
        else if (what === 'go') go(Number(shell.getAttribute('data-i')));
        return;
      }
      if (ev.target.id === 'wz-mask') { api.closeModal(); return; }
      act('data-act', ev);
    });
    root.addEventListener('change', function (ev) { act('data-change', ev); });
    root.addEventListener('input', function (ev) { act('data-input', ev); });
    root.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target.closest('[data-enter]')) { ev.preventDefault(); act('data-enter', ev); }
      if (ev.key === 'Escape') api.closeModal();
    });

    // Drag to reorder.
    root.addEventListener('dragstart', function (ev) {
      var row = ev.target.closest('[data-drag-id]');
      if (!row) return;
      dragId = row.getAttribute('data-drag-id');
      row.classList.add('dragging');
      ev.dataTransfer.effectAllowed = 'move';
      try { ev.dataTransfer.setData('text/plain', dragId); } catch (e) { /* some browsers require it, some forbid it */ }
    });
    root.addEventListener('dragover', function (ev) {
      var row = ev.target.closest('[data-drag-id]');
      if (!row || dragId == null) return;
      ev.preventDefault();
      [].forEach.call(root.querySelectorAll('.drop-target'), function (r) { r.classList.remove('drop-target'); });
      row.classList.add('drop-target');
    });
    root.addEventListener('drop', function (ev) {
      var row = ev.target.closest('[data-drag-id]');
      var zone = ev.target.closest('[data-drop]');
      if (!row || !zone || dragId == null) return;
      ev.preventDefault();
      var fn = def.actions[zone.getAttribute('data-drop')];
      var from = dragId, to = row.getAttribute('data-drag-id');
      dragId = null;
      if (fn && from !== to) fn({ from: from, to: to }, api);
    });
    root.addEventListener('dragend', function () {
      dragId = null;
      [].forEach.call(root.querySelectorAll('.dragging, .drop-target'), function (r) {
        r.classList.remove('dragging'); r.classList.remove('drop-target');
      });
    });
  }

  function mount(definition, el) {
    def = definition;
    root = el || document.body;
    storeKey = 'pmskills.wizard.' + def.id;
    state = load() || def.initialState();
    if (!(state.step >= 0 && state.step < def.steps.length)) state.step = 0;

    var extra = (def.header || []).map(function (h) {
      return '<button class="btn ghost" data-act="' + esc(h.act) + '">' + esc(h.label) + '</button>';
    }).join('');

    root.innerHTML =
      '<div class="app">' +
        '<header class="app-hd"><div class="brand"><div class="brand-mark">' + esc(def.brand.mark) + '</div>' +
          '<div><h1>' + esc(def.brand.title) + ' <span class="sub">/ ' + esc(def.brand.sub) + '</span></h1></div></div>' +
          '<div class="hd-actions">' + extra + '<button class="btn" data-shell="reset">Reset</button></div></header>' +
        '<div class="stepper" id="wz-stepper"></div>' +
        '<main class="panel" id="wz-panel"></main>' +
        '<div class="foot-nav"><button class="btn" id="wz-back" data-shell="back">← Back</button>' +
          '<div class="hint" id="wz-hint"></div>' +
          '<button class="btn primary" id="wz-next" data-shell="next">Next →</button></div>' +
      '</div>' +
      '<div class="modal-mask" id="wz-mask"><div class="modal"><span class="modal-close" data-shell="close">×</span>' +
        '<div id="wz-modal"></div></div></div>' +
      '<div class="toast" id="wz-toast"></div>';

    wire();
    enter();
    render();
    return api;
  }

  global.PMWizard = { mount: mount, esc: esc };
})(window);
