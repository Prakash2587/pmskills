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
 * A step can ask its questions one at a time instead of showing a form:
 *
 *   api.convo(el, {
 *     key: 'ctx',                        // state.ctx = { answered: { id: true }, active: id | null }
 *     title, sub,
 *     questions: [{
 *       id, label,                       // label names the answer once it collapses
 *       prompt, hint, optional,
 *       body(state)   -> html,           // the control; mark the field to focus with data-autofocus
 *       answer(state) -> html,           // the answer as a short sentence
 *       valid(state)  -> true | 'why not',
 *       onSkip(state)                    // optional questions: clear the value
 *     }],
 *     done: html                         // shown once every question is answered
 *   });
 *   PMWizard.convoDone(state.ctx, ids)   // for canAdvance
 *
 * Inside a question, fields use data-input (so the value is saved as it is typed) and
 * Enter confirms. A choice card answers and moves on in one click: api.answer(id, mutate).
 *
 * State is saved to localStorage on every change and restored on load, so a
 * visitor who leaves to sign up for Zoho Projects finds their plan waiting.
 * ========================================================================== */
(function (global) {
  'use strict';

  var def, state, root, storeKey, dragId = null, toastTimer = null, convoCfg = null;

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

  /* ---------- conversation: one question at a time ---------- */

  function convoState(key) {
    if (!state[key] || !state[key].answered) state[key] = { answered: {}, active: null };
    return state[key];
  }
  function convoDone(c, ids) {
    return !!c && !!c.answered && ids.every(function (id) { return c.answered[id]; });
  }
  function convoActive(cfg) {
    var c = convoState(cfg.key), qs = cfg.questions, i;
    for (i = 0; i < qs.length; i++) if (qs[i].id === c.active) return qs[i];
    for (i = 0; i < qs.length; i++) if (!c.answered[qs[i].id]) return qs[i];
    return null;
  }

  function convo(el, cfg) {
    convoCfg = cfg;
    var c = convoState(cfg.key), active = convoActive(cfg), qs = cfg.questions;
    var answered = qs.filter(function (q) { return c.answered[q.id]; }).length;
    var html = '<h2 class="step-title">' + esc(cfg.title) + '</h2>' +
      (cfg.sub ? '<p class="step-sub">' + esc(cfg.sub) + '</p>' : '') +
      '<div class="q-progress"><div class="q-progress-bar"><i style="width:' + (answered / qs.length * 100).toFixed(0) + '%"></i></div>' +
      '<span>' + answered + ' of ' + qs.length + ' answered</span></div><div class="convo">';

    qs.forEach(function (q, i) {
      if (active && q.id === active.id) {
        html += '<div class="q-card" id="wz-q"><div class="q-num">' + (i + 1) + '<span>→</span></div><div class="q-body">' +
          '<h3 class="q-prompt">' + esc(q.prompt) + (q.optional ? ' <em>optional</em>' : '') + '</h3>' +
          (q.hint ? '<p class="q-hint">' + esc(q.hint) + '</p>' : '') +
          '<div class="q-control">' + q.body(state) + '</div>' +
          '<div class="q-error" id="wz-q-err"></div>' +
          '<div class="q-actions"><button class="btn primary" data-shell="q-ok">OK ✓</button>' +
          '<span class="q-enter">or press Enter ↵</span>' +
          (q.optional ? '<button class="btn ghost" data-shell="q-skip">Skip</button>' : '') + '</div></div></div>';
      } else if (c.answered[q.id]) {
        html += '<div class="q-row" data-shell="q-edit" data-q="' + esc(q.id) + '" title="Change this answer">' +
          '<span class="q-tick">✓</span><span class="q-label">' + esc(q.label) + '</span>' +
          '<span class="q-answer">' + q.answer(state) + '</span><span class="q-change">Change</span></div>';
      }
    });
    if (!active) {
      html += '<div class="q-done"><div>' + (cfg.done || 'That is everything for this step.') + '</div>' +
        '<button class="btn primary" data-shell="next" data-autofocus>Continue →</button></div>';
    }
    el.innerHTML = html + '</div>';
  }

  function focusConvo() {
    var card = $('wz-q'), scope = card || root.querySelector('.q-done');
    if (!scope) return;
    var f = scope.querySelector('[data-autofocus]') || scope.querySelector('[data-shell="q-ok"]');
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
    if (scope.scrollIntoView) scope.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Close the open question: check it (unless skipping), collapse it, open the next one. */
  function closeQuestion(skip, mutate) {
    var cfg = convoCfg;
    if (!cfg) return;
    var q = convoActive(cfg);
    if (!q) return;
    if (mutate) mutate(state);
    if (skip) { if (q.onSkip) q.onSkip(state); }
    else {
      var ok = q.valid ? q.valid(state) : true;
      if (ok !== true) {
        var err = $('wz-q-err');
        if (err) err.textContent = ok || 'This one is needed to continue.';
        save();
        return;
      }
    }
    var c = convoState(cfg.key);
    c.answered[q.id] = true; c.active = null;
    save(); render(); focusConvo();
  }

  function render() {
    convoCfg = null;
    $('wz-stepper').innerHTML = def.steps.map(function (s, i) {
      var cls = i < state.step ? 'done' : (i === state.step ? 'active' : '');
      return '<div class="step ' + cls + '"' + (i < state.step ? ' data-shell="go" data-i="' + i + '"' : '') +
        '><div class="num">' + (i < state.step ? '✓' : (i < 9 ? '0' : '') + (i + 1)) + '</div><div>' + esc(s.title) + '</div></div>';
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
    if (convoCfg) focusConvo();
  }

  var api = {
    get state() { return state; },
    esc: esc,
    /** Mutate state, save, re-render the step. */
    set: function (fn) { fn(state); save(); render(); },
    /** Mutate state and save WITHOUT re-rendering — for fields being typed in. */
    patch: function (fn) { fn(state); save(); refreshNav(); },
    go: go,
    convo: convo,
    /** Set a value and close the open question in one move — for choice cards. */
    answer: function (id, mutate) {
      var q = convoCfg && convoActive(convoCfg);
      if (q && q.id === id) closeQuestion(false, mutate);
      else if (mutate) api.set(mutate);
    },
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
        else if (what === 'q-ok') closeQuestion(false);
        else if (what === 'q-skip') closeQuestion(true);
        else if (what === 'q-edit' && convoCfg) {
          convoState(convoCfg.key).active = shell.getAttribute('data-q');
          save(); render(); focusConvo();
        }
        return;
      }
      if (ev.target.id === 'wz-mask') { api.closeModal(); return; }
      act('data-act', ev);
    });
    root.addEventListener('change', function (ev) { act('data-change', ev); });
    root.addEventListener('input', function (ev) { act('data-input', ev); });
    root.addEventListener('keydown', function (ev) {
      var t = ev.target;
      if (ev.key === 'Enter' && t.tagName === 'INPUT' && t.type !== 'checkbox' && t.closest('.q-card')) {
        ev.preventDefault(); closeQuestion(false); return;
      }
      // Lettered choice cards answer on their letter, as long as nobody is typing in a field.
      if (/^[a-z0-9]$/i.test(ev.key) && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) {
        var card = $('wz-q'), hit = card && card.querySelector('[data-key="' + ev.key.toUpperCase() + '"]');
        if (hit) { ev.preventDefault(); hit.click(); return; }
      }
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
          '<div class="hd-actions">' + extra + '<button class="btn ghost" data-shell="reset">Reset</button>' +
          (global.PMUI ? global.PMUI.themeToggle() : '') + '</div></header>' +
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

    // A second tab on the same tool would otherwise keep its own older copy of the
    // session and show different answers (a different currency, say) from this one.
    global.addEventListener('storage', function (ev) {
      if (ev.key !== storeKey || !ev.newValue) return;
      var fresh = load();
      if (fresh) { state = fresh; render(); }
    });
    return api;
  }

  global.PMWizard = { mount: mount, esc: esc, convoDone: convoDone };
})(window);
