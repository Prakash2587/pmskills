/* ============================================================================
 * WBS Builder — the wbs-builder skill's guided tool.
 *
 * Only this skill's STEPS live here. The chrome and the one-question-at-a-time
 * flow come from ../wizard/wizard.js, the Land step from ../wizard/land.js, and
 * the tree, the checks and the Zoho Projects plan from the tested engine
 * (PMEngine.wbs). The page itself never calls a portal.
 * ========================================================================== */
(function () {
  'use strict';

  var W = window.PMEngine.wbs;
  var K = window.PMEngine.knowledge.wbs;
  var Land = window.PMLand;
  var esc = window.PMWizard.esc;

  var SIZE_CHOICES = [0, 40, 80, 160];
  var SHOW = 6;                       // items listed before "and N more"

  /* ---------- state ---------- */

  function blank() {
    return { step: 0, template: null, include: {}, name: '', sizeLimit: 0, model: null, built: '',
      ctx: { answered: {}, active: null }, collapsed: {}, acks: {}, confirmed: {},
      landPath: 'new', landDone: {}, lead: null };
  }
  function templateOf(s) { return K.TEMPLATES.filter(function (t) { return t.key === s.template; })[0]; }
  function hrs(n) { return (Math.round(n * 10) / 10) + 'h'; }
  function opt(v, label, cur) {
    return '<option value="' + esc(v) + '"' + (String(cur == null ? '' : cur) === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>';
  }
  function wantBranch(s, b) { return b.key in s.include ? !!s.include[b.key] : !b.off; }
  function readiness(s) { return W.readiness(s.model, { acks: s.acks, confirmed: s.confirmed }); }
  function focusOk() { var ok = document.querySelector('#wz-q [data-shell="q-ok"]'); if (ok) ok.focus(); }

  /* Brings the tree in line with the chosen branches without throwing away edits:
   * a branch that was unticked is removed, one that was ticked is added from the template. */
  function syncModel(s) {
    var t = templateOf(s);
    if (!s.model || s.model.project.template !== t.key) {
      s.model = W.instantiate(t.key, s.include);
      s.collapsed = {}; s.acks = {}; s.confirmed = {};
    } else {
      t.branches.forEach(function (b) {
        var have = s.model.nodes.filter(function (n) { return n.parent == null && n.tkey === b.key; })[0];
        if (have && !wantBranch(s, b)) W.remove(s.model, have.id);
        if (!have && wantBranch(s, b)) {
          var top = W.addChild(s.model, null, { title: b.title, tkey: b.key });
          b.areas.forEach(function (a) {
            var area = W.addChild(s.model, top, { title: a[0] });
            a[1].forEach(function (p) { W.addChild(s.model, area, { title: p[0], hours: p[1], role: p[2], sample: true }); });
          });
        }
      });
    }
    s.model.project.name = s.name;
    s.model.options.sizeLimit = s.sizeLimit;
  }

  /* ---------- 1. Template ---------- */

  function renderTemplate(el, api) {
    var s = api.state;
    el.innerHTML =
      '<h2 class="step-title">What kind of project is it?</h2>' +
      '<p class="step-sub">Pick the closest one. It gives you a starting structure, which you then make your own.</p>' +
      '<div class="templates" style="grid-template-columns:repeat(2,1fr)">' + K.TEMPLATES.map(function (t) {
        var on = t.branches.filter(function (b) { return !b.off; });
        var pk = on.reduce(function (n, b) { return n + b.areas.reduce(function (m, a) { return m + a[1].length; }, 0); }, 0);
        return '<div class="tpl-card ' + (s.template === t.key ? 'selected' : '') + '" data-act="template" data-k="' + t.key + '">' +
          '<h3>' + esc(t.title) + '</h3><p>' + esc(t.tagline) + '</p><div class="tpl-meta">' +
          t.chips.map(function (c) { return '<span class="chip accent">' + esc(c) + '</span>'; }).join('') +
          '<span class="chip">' + on.length + ' branches</span><span class="chip">' + pk + ' work packages</span></div></div>';
      }).join('') + '</div>' +
      '<p class="aside" style="margin-top:22px">More project types are being added. The structure is a starting point either way: every branch can be changed.</p>';
  }

  /* ---------- 2. Details — asked one question at a time ---------- */

  function detailQuestions(s) {
    var t = templateOf(s) || { branches: [], basis: '' };
    return [
      { id: 'name', label: 'Project',
        prompt: 'What is the project called?',
        hint: 'This becomes the project\'s name in Zoho Projects.',
        body: function () {
          return '<input type="text" maxlength="200" value="' + esc(s.name) + '" placeholder="e.g. Head office refurbishment" data-input="name" data-autofocus>';
        },
        answer: function () { return '<b>' + esc(s.name) + '</b>'; },
        valid: function () { return s.name.trim() ? true : 'It needs a name to be created.'; } },

      { id: 'branches', label: 'Branches',
        prompt: 'Which parts does this project have?',
        hint: t.basis,
        body: function () {
          return '<div class="branch-pick">' + t.branches.map(function (b) {
            var on = wantBranch(s, b);
            return '<label class="cb ' + (on ? 'on' : '') + '"><input type="checkbox" data-change="branch" data-k="' + b.key + '"' + (on ? ' checked' : '') + '>' +
              '<span><b>' + esc(b.title) + '</b><small>' + esc(b.basis) + '</small></span></label>';
          }).join('') + '</div>';
        },
        answer: function () {
          var on = t.branches.filter(function (b) { return wantBranch(s, b); });
          return '<b>' + on.length + ' of ' + t.branches.length + '</b> branches: ' + esc(on.map(function (b) { return b.title; }).join(', '));
        },
        valid: function () { return t.branches.some(function (b) { return wantBranch(s, b); }) ? true : 'Keep at least one.'; } },

      { id: 'size', label: 'Size limit',
        prompt: 'Should large work packages be flagged?',
        hint: 'Your call. No standard fixes a size, so nothing is flagged unless you set a limit.',
        body: function () {
          return '<div class="pills">' + SIZE_CHOICES.map(function (n) {
            return '<button type="button" class="pill-btn' + (Number(s.sizeLimit) === n ? ' on' : '') + '" data-act="size" data-n="' + n + '">' +
              (n ? 'Above ' + n + ' hours' : 'No limit') + '</button>';
          }).join('') + '</div><div class="q-inline">or above <input type="number" min="0" step="1" value="' + (s.sizeLimit || '') +
            '" placeholder="hours" data-input="size-num"> hours</div><div class="q-note">' + esc(K.SIZE_CONTEXT) + '</div>';
        },
        answer: function () { return s.sizeLimit > 0 ? 'Flag anything above <b>' + hrs(s.sizeLimit) + '</b>' : '<b>No limit</b> — nothing is flagged for size'; } }
    ];
  }
  function renderDetails(el, api) {
    api.convo(el, { key: 'ctx', title: 'A few quick questions', sub: 'Three of them. Click any answer to change it.',
      questions: detailQuestions(api.state), done: '<b>That is enough to start.</b> Next: the structure itself.' });
  }
  function detailsDone(s) {
    return window.PMWizard.convoDone(s.ctx, detailQuestions(s).map(function (q) { return q.id; }));
  }

  /* ---------- 3. Structure ---------- */

  function visibleRows(s, o) {
    var hidden = {};
    return o.rows.filter(function (r) {
      if (r.parentId != null && (hidden[r.parentId] || s.collapsed[r.parentId])) { hidden[r.id] = true; return false; }
      return true;
    });
  }
  function structureStats(o) {
    return '<span><b>' + o.leaves.length + '</b> work packages</span><span><b>' + hrs(o.total) + '</b> in total</span>' +
      '<span><b>' + (o.maxDepth + 2) + '</b> levels</span>';
  }
  // Totals change with every hour typed. Refresh them in place so the field being typed in keeps focus.
  function refreshSums(s) {
    var o = W.outline(s.model);
    [].forEach.call(document.querySelectorAll('[data-sum]'), function (el) {
      var r = o.byId.get(el.getAttribute('data-sum'));
      if (r) el.textContent = hrs(r.hours);
    });
    var st = document.getElementById('tree-stats');
    if (st) st.innerHTML = structureStats(o);
  }

  function renderStructure(el, api) {
    var s = api.state, o = W.outline(s.model);
    var rows = visibleRows(s, o).map(function (r) {
      var n = r.node, f = function (k) { return ' data-change="node" data-id="' + r.id + '" data-k="' + k + '"'; };
      var tog = r.isLeaf ? '<span class="tog"></span>'
        : '<button class="tog" data-act="toggle" data-id="' + r.id + '" title="' + (s.collapsed[r.id] ? 'Expand' : 'Collapse') + '">' + (s.collapsed[r.id] ? '▸' : '▾') + '</button>';
      return '<tr class="d' + Math.min(r.depth, 4) + (r.isLeaf ? ' leaf' : ' parent') + '" draggable="true" data-drag-id="' + r.id + '">' +
        '<td class="code">' + r.code + '</td>' +
        '<td class="cell el"><div style="padding-left:' + (r.depth * 18) + 'px">' + tog +
          '<input type="text" value="' + esc(n.title) + '" placeholder="Name this element"' + f('title') + '></div></td>' +
        (r.isLeaf
          ? '<td class="cell"><input type="text" list="wbs-roles" value="' + esc(n.role) + '" placeholder="Role"' + f('role') + '></td>' +
            '<td class="cell num"><input type="number" min="0" step="any" value="' + (n.hours || n.hours === 0 ? esc(n.hours) : '') + '" placeholder="hours"' + f('hours') + '>' +
              (n.sample && n.hours ? '<span class="sample-tag" title="A sample figure from the template. Change it to make it yours.">sample</span>' : '') + '</td>' +
            '<td class="cell"><input type="text" value="' + esc(n.done) + '" placeholder="Done means…"' + f('done') + '></td>'
          : '<td></td><td class="sum" data-sum="' + r.id + '">' + hrs(r.hours) + '</td><td></td>') +
        '<td class="ops"><button class="x-btn" title="Add a child" data-act="add-child" data-id="' + r.id + '">＋</button>' +
          '<button class="x-btn" title="Add below" data-act="add-below" data-id="' + r.id + '">↳</button>' +
          '<button class="x-btn" title="Move up" data-act="node-up" data-id="' + r.id + '">↑</button>' +
          '<button class="x-btn" title="Move down" data-act="node-down" data-id="' + r.id + '">↓</button>' +
          '<button class="x-btn" title="Remove" data-act="node-del" data-id="' + r.id + '">×</button></td></tr>';
    }).join('');
    var roles = [];
    s.model.nodes.forEach(function (n) { if (n.role && roles.indexOf(n.role) === -1) roles.push(n.role); });

    el.innerHTML =
      '<h2 class="step-title">Make the structure yours</h2>' +
      '<p class="step-sub">Rename, add, remove and reorder. Hours sit on work packages; everything above them adds up on its own.</p>' +
      '<div class="tree-bar"><div class="tree-stats" id="tree-stats">' + structureStats(o) + '</div>' +
        '<div class="more-acts"><button class="btn small ghost" data-act="expand-all">Expand all</button>' +
        '<button class="btn small ghost" data-act="collapse-all">Collapse to branches</button>' +
        '<button class="btn small" data-act="add-branch">+ Add a branch</button></div></div>' +
      '<div class="table-wrap"><table class="grid tree"><thead><tr><th>Code</th><th>Element</th><th>Role</th><th>Hours</th><th>Done means <i>one line</i></th><th></th></tr></thead>' +
        '<tbody data-drop="reorder">' + (rows || '<tr><td colspan="6" class="plan-empty">Nothing here yet. Add a branch.</td></tr>') + '</tbody></table></div>' +
      '<div class="legend">Codes renumber themselves when anything moves. Figures marked <b>sample</b> came with the template: change one and the mark goes. Drag a row to reorder it within its parent.</div>' +
      '<datalist id="wbs-roles">' + roles.map(function (r) { return '<option value="' + esc(r) + '">'; }).join('') + '</datalist>';
  }

  /* ---------- 4. People and sequence ---------- */

  function renderPeople(el, api) {
    var s = api.state, o = W.outline(s.model);
    var roles = [];
    o.leaves.forEach(function (r) { var x = (r.node.role || '').trim(); if (x && roles.indexOf(x) === -1) roles.push(x); });
    var pk = o.leaves.map(function (r) { return opt(r.id, r.code + ' ' + r.node.title, ''); }).join('');
    var deps = s.model.deps.map(function (d, i) {
      var a = o.byId.get(d.from), b = o.byId.get(d.to);
      return '<div class="dep-row"><span><b>' + esc(a ? a.code + ' ' + a.node.title : '(removed)') + '</b> must finish before <b>' +
        esc(b ? b.code + ' ' + b.node.title : '(removed)') + '</b> starts</span>' +
        '<button class="x-btn" title="Remove" data-act="dep-del" data-i="' + i + '">×</button></div>';
    }).join('');

    el.innerHTML =
      '<h2 class="step-title">Who, and in what order?</h2>' +
      '<p class="step-sub">Both parts are optional. Skip them and the structure is still complete.</p>' +

      '<h3 class="sec" style="margin-top:0">Who fills each role</h3>' +
      '<p class="aside">Zoho Projects assigns work to named people, never to a role. Name someone here and their tasks are assigned to them, provided they are a user of your portal. Leave it blank and the tasks are created unassigned, with the role kept in each one.</p>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>Role</th><th>Work packages</th><th>Hours</th><th>Person <i>optional</i></th></tr></thead><tbody>' +
        (roles.map(function (role) {
          var mine = o.leaves.filter(function (r) { return (r.node.role || '').trim() === role; });
          return '<tr><td style="padding-left:14px">' + esc(role) + '</td><td>' + mine.length + '</td><td>' + hrs(mine.reduce(function (a, r) { return a + r.hours; }, 0)) + '</td>' +
            '<td class="cell"><input type="text" value="' + esc(s.model.people[role] || '') + '" placeholder="Name, as it appears in Zoho Projects" data-change="person" data-role="' + esc(role) + '"></td></tr>';
        }).join('') || '<tr><td colspan="4" class="plan-empty">No roles yet. Add them on the previous step.</td></tr>') + '</tbody></table></div>' +

      '<h3 class="sec">What has to finish before what</h3>' +
      '<p class="aside">A dependency is schedule logic, so it sits beside the structure, not in it. Each one joins two work packages: the first must finish before the second starts.</p>' +
      (deps ? '<div class="deps">' + deps + '</div>' : '') +
      '<div class="dep-add"><select id="dep-from"><option value="">First this…</option>' + pk + '</select><span>then</span>' +
        '<select id="dep-to"><option value="">…this</option>' + pk + '</select><button class="btn" data-act="dep-add">Add</button></div>' +
      '<div class="gate-msg err" id="dep-err" style="text-align:left;margin-top:8px"></div>';
  }

  /* ---------- 5. Check ---------- */

  function itemList(items) {
    return items.length ? '<ul>' + items.slice(0, SHOW).map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') +
      (items.length > SHOW ? '<li class="more">and ' + (items.length - SHOW) + ' more</li>' : '') + '</ul>' : '';
  }
  function renderCheck(el, api) {
    var s = api.state, rd = readiness(s), res = rd.results;
    var by = function (level, state) { return res.filter(function (r) { return r.level === level && r.state === state; }); };
    var blockers = by('blocker', 'fail'), warnings = by('warning', 'fail'), c1 = res.filter(function (r) { return r.id === 'C1'; })[0];
    var passed = res.filter(function (r) { return r.state === 'pass' && r.level !== 'confirm'; });
    var tops = W.outline(s.model).rows.filter(function (r) { return r.depth === 0; });

    el.innerHTML =
      '<h2 class="step-title">Check it before it is created</h2>' +
      '<p class="step-sub">' + (blockers.length
        ? '<b>' + blockers.length + ' to fix first.</b> These would break in Zoho Projects.'
        : rd.ready ? '<b>Ready.</b> Nothing is blocking, and you have seen every warning.'
        : 'Nothing is blocking. Read each warning and confirm each branch to carry on.') + '</p>' +

      (blockers.length ? '<h3 class="sec" style="margin-top:0">Fix these first</h3><div class="val-grid">' + blockers.map(function (r) {
        return '<div class="val-card fail"><span class="status">MUST FIX</span><h4>' + esc(r.title) + '</h4><p>' + esc(r.detail) + '</p>' + itemList(r.items) +
          '<div class="basis">' + esc(r.basis) + '</div></div>';
      }).join('') + '</div><div class="btn-row"><button class="btn" data-act="goto" data-n="2">Go back to the structure</button></div>' : '') +

      (warnings.length ? '<h3 class="sec"' + (blockers.length ? '' : ' style="margin-top:0"') + '>Warnings — read, then carry on</h3><div class="val-grid">' + warnings.map(function (r) {
        var ok = s.acks[r.id] === r.sig;
        return '<div class="val-card warn"><span class="status">WARNING</span><h4>' + esc(r.title) + '</h4><p>' + esc(r.detail) + '</p>' + itemList(r.items) +
          '<div class="basis">' + esc(r.basis) + '</div>' +
          '<label class="ack"><input type="checkbox" data-change="ack" data-id="' + r.id + '"' + (ok ? ' checked' : '') + '> I have read this — carry on</label></div>';
      }).join('') + '</div>' : '') +

      '<h3 class="sec">Only you can confirm this</h3>' +
      '<div class="val-card' + (c1.state === 'pass' ? ' pass' : '') + '"><h4 style="margin-top:0">' + esc(c1.title) + '</h4><p>' + esc(c1.basis) + '</p>' +
        '<div class="branch-ticks">' + tops.map(function (r) {
          return '<label class="cb ' + (s.confirmed[r.id] ? 'on' : '') + '"><input type="checkbox" data-change="confirm" data-id="' + r.id + '"' +
            (s.confirmed[r.id] ? ' checked' : '') + '><span>' + esc(r.code + ' ' + r.node.title) + '</span></label>';
        }).join('') + '</div></div>' +

      '<h3 class="sec">Passed</h3><div class="passed">' + passed.map(function (r) {
        return '<div><span class="status-ok">PASS</span><b>' + esc(r.title) + '</b><span>' + esc(r.detail) + '</span></div>';
      }).join('') + '</div>';
  }

  /* ---------- 6. Land ---------- */

  function planFor(s, mapping) {
    var m = JSON.parse(JSON.stringify(s.model)); m.options.mapping = mapping;
    return W.buildZohoPlan(m);
  }
  function renderLand(el, api) {
    var s = api.state, rd = readiness(s), plan = W.buildZohoPlan(s.model);
    var blocked = rd.ready ? '' : rd.blockers.length
      ? 'Fix this first: ' + rd.blockers[0].title.toLowerCase() + '.'
      : 'Go back one step and finish the checks first.';

    el.innerHTML =
      '<h2 class="step-title">Create it in Zoho Projects</h2>' +
      '<p class="step-sub">Choose how the structure should sit in Zoho Projects, then hand it to your agent. It is always created as a new project.</p>' +

      '<h3 class="sec" style="margin-top:0">How it maps</h3>' +
      '<div class="choices">' + ['A', 'B'].map(function (k) {
        var m = K.MAPPINGS[k], c = planFor(s, k).counts;
        return '<button type="button" class="choice' + (s.model.options.mapping === k ? ' on' : '') + '" data-act="mapping" data-k="' + k + '"><kbd>' + k + '</kbd><div>' +
          '<b>' + esc(m.label) + '</b><span>' + esc(m.summary) + '</span>' +
          '<span class="counts">' + (c.phases ? c.phases + ' phases · ' : '') + c.tasklists + ' task lists · ' + c.tasks + ' tasks' + (c.subtasks ? ' · ' + c.subtasks + ' subtasks' : '') + '</span></div></button>';
      }).join('') + '</div>' +
      '<div class="land-opts">' +
        '<label class="ack"><input type="checkbox" data-change="option" data-k="prefixCodes"' + (s.model.options.prefixCodes ? ' checked' : '') + '> Put the code in front of each name (Zoho Projects has no outline numbers of its own)</label>' +
        '<label class="ack"><input type="checkbox" data-change="option" data-k="rollup"' + (s.model.options.rollup ? ' checked' : '') + '> Switch on roll-up, so parents show the total of their subtasks. Needs the Premium plan or above, and cannot be switched off later</label>' +
      '</div>' +
      plan.notes.map(function (n) { return '<p class="aside note-line">' + esc(n) + '</p>'; }).join('') +

      Land.route(s, { text: 'Your agent creates this structure in your portal as a new project. It shows you what it is about to create, waits for your yes, and reports back what exists.',
        promptNote: 'It shows you what it will create and waits for your yes.', blocked: blocked }) +

      '<h3 class="sec">More ways to use this structure</h3><div class="more">' +
        '<div class="more-row"><div><b>Download the structure</b><span class="note">The outline, the checks and the mapping, to keep or share.</span></div>' +
          Land.downloads(s, [{ act: 'report-pdf', label: 'PDF' }, { act: 'export-md', label: 'Markdown' }, { act: 'export-csv', label: 'CSV' }]) + '</div>' +
        '<div class="more-row"><div><b>For developers</b><span class="note">Everything that would be created, in order, as data. Nothing is sent from this page.</span></div>' +
          '<div class="more-acts"><button class="btn small" data-act="show-plan">See what gets created</button></div></div>' +
      '</div>';
  }

  function reportHtml(s) {
    var o = W.outline(s.model), plan = W.buildZohoPlan(s.model), c = plan.counts;
    var res = W.validate(s.model, { confirmed: s.confirmed });
    var sec = function (title, body) { return '<section><h2>' + title + '</h2>' + body + '</section>'; };
    var stat = function (label, value) { return '<div><span>' + label + '</span><b>' + value + '</b></div>'; };
    return '<div class="r-top"><span>PM Skills · Work breakdown structure</span><span>Estimates, not measurements</span></div>' +
      '<h1>' + esc(s.model.project.name) + '</h1>' +
      '<p class="r-meta">' + esc(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })) + ' · ' + esc((templateOf(s) || {}).title || '') + '</p>' +
      '<div class="r-stats">' + stat('Work packages', o.leaves.length) + stat('Total effort', hrs(o.total)) + stat('Levels', o.maxDepth + 2) + stat('Dependencies', s.model.deps.length) + '</div>' +
      sec('Structure', '<table><thead><tr><th>Code</th><th>Element</th><th>Role</th><th>Hours</th><th>Done means</th></tr></thead><tbody>' + o.rows.map(function (r) {
        return '<tr><td class="n">' + r.code + '</td><td style="padding-left:' + (r.depth * 14) + 'px">' + (r.isLeaf ? esc(r.node.title) : '<b>' + esc(r.node.title) + '</b>') + '</td>' +
          '<td>' + (r.isLeaf ? esc(r.node.role) : '') + '</td><td class="n">' + hrs(r.hours) + (r.isLeaf && r.node.sample ? ' <small>sample</small>' : '') + '</td><td>' + (r.isLeaf ? esc(r.node.done) : '') + '</td></tr>';
      }).join('') + '</tbody></table>') +
      (s.model.deps.length ? sec('Dependencies', '<ul>' + s.model.deps.map(function (d) {
        var a = o.byId.get(d.from), b = o.byId.get(d.to);
        return a && b ? '<li>' + esc(a.code + ' ' + a.node.title) + ' must finish before ' + esc(b.code + ' ' + b.node.title) + ' starts</li>' : '';
      }).join('') + '</ul>') : '') +
      sec('Checks', '<table><tbody>' + res.map(function (v) {
        var cls = v.state === 'pass' ? 'pass' : v.level === 'blocker' ? 'fail' : 'warn';
        return '<tr><td><span class="r-tag ' + cls + '">' + (v.state === 'pass' ? 'pass' : v.level) + '</span></td><td><b>' + esc(v.title) + '</b><small>' + esc(v.detail) +
          (v.items.length ? ' ' + esc(v.items.slice(0, SHOW).join('; ')) + (v.items.length > SHOW ? '; and ' + (v.items.length - SHOW) + ' more' : '') + '.' : '') + '</small></td></tr>';
      }).join('') + '</tbody></table>') +
      sec('In Zoho Projects', '<p>Mapping: ' + esc(plan.mapping_label) + '. One new project' + (c.phases ? ', ' + c.phases + ' phases' : '') + ', ' + c.tasklists + ' task lists, ' +
        c.tasks + ' tasks, ' + c.subtasks + ' subtasks and ' + c.dependencies + ' dependencies.</p><ul>' + plan.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>') +
      '<p class="r-foot">Hours are estimates. A figure marked "sample" came with the template and has not been reviewed.</p>';
  }

  /* ---------- actions ---------- */

  function nodeOf(s, id) { return s.model.nodes.filter(function (n) { return n.id === id; })[0]; }
  function slug(s) { return (s.name || 'wbs').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'wbs'; }
  function focusRow(id) {
    var input = document.querySelector('tr[data-drag-id="' + id + '"] input[type="text"]');
    if (input) input.focus();
  }

  var actions = {
    template: function (el, api) {
      var key = el.getAttribute('data-k'), cur = api.state;
      if (cur.model && cur.template !== key && !window.confirm('This replaces the structure you have built. Continue?')) return;
      api.set(function (s) {
        if (s.template !== key) { s.include = {}; s.model = null; delete s.ctx.answered.branches; }
        s.template = key;
      });
    },

    /* details */
    name: function (el, api) { api.patch(function (s) { s.name = el.value.trim(); }); },
    branch: function (el, api) {
      api.set(function (s) { s.include[el.getAttribute('data-k')] = el.checked; });
    },
    size: function (el, api) { api.answer('size', function (s) { s.sizeLimit = Number(el.getAttribute('data-n')); }); },
    'size-num': function (el, api) { api.patch(function (s) { s.sizeLimit = Math.max(0, Number(el.value) || 0); }); },

    /* structure */
    node: function (el, api) {
      var id = el.getAttribute('data-id'), k = el.getAttribute('data-k');
      api.patch(function (s) {
        var n = nodeOf(s, id);
        if (!n) return;
        if (k === 'hours') { n.hours = el.value === '' ? null : Math.max(0, Number(el.value) || 0); n.sample = false; }
        else n[k] = el.value.trim();
      });
      if (k === 'hours') {
        refreshSums(api.state);
        var tag = el.parentNode.querySelector('.sample-tag');
        if (tag) tag.parentNode.removeChild(tag);
      }
    },
    toggle: function (el, api) { api.set(function (s) { var id = el.getAttribute('data-id'); s.collapsed[id] = !s.collapsed[id]; }); },
    'expand-all': function (el, api) { api.set(function (s) { s.collapsed = {}; }); },
    'collapse-all': function (el, api) {
      api.set(function (s) { s.collapsed = {}; s.model.nodes.forEach(function (n) { if (n.parent == null) s.collapsed[n.id] = true; }); });
    },
    'add-branch': function (el, api) {
      var id;
      api.set(function (s) { id = W.addChild(s.model, null, {}); });
      focusRow(id);
    },
    'add-child': function (el, api) {
      var id, parent = el.getAttribute('data-id');
      api.set(function (s) { id = W.addChild(s.model, parent, {}); s.collapsed[parent] = false; });
      focusRow(id);
    },
    'add-below': function (el, api) {
      var id;
      api.set(function (s) { id = W.addSibling(s.model, el.getAttribute('data-id'), {}); });
      focusRow(id);
    },
    'node-up': function (el, api) { api.set(function (s) { W.move(s.model, el.getAttribute('data-id'), -1); }); },
    'node-down': function (el, api) { api.set(function (s) { W.move(s.model, el.getAttribute('data-id'), 1); }); },
    'node-del': function (el, api) {
      var id = el.getAttribute('data-id'), under = W.outline(api.state.model).byId.get(id);
      if (under && under.children.length && !window.confirm('Remove this and everything under it?')) return;
      api.set(function (s) { W.remove(s.model, id); });
    },
    reorder: function (drag, api) {
      var moved;
      api.set(function (s) { moved = W.reorder(s.model, drag.from, drag.to); });
      if (!moved) api.toast('Dragging reorders within the same parent only.');
    },

    /* people and sequence */
    person: function (el, api) {
      api.patch(function (s) {
        var role = el.getAttribute('data-role'), v = el.value.trim();
        if (v) s.model.people[role] = v; else delete s.model.people[role];
      });
    },
    'dep-add': function (el, api) {
      var from = document.getElementById('dep-from').value, to = document.getElementById('dep-to').value;
      var why = !from || !to ? 'Pick both work packages.' : W.whyNotDep(api.state.model, from, to);
      if (why) { document.getElementById('dep-err').textContent = why; return; }
      api.set(function (s) { s.model.deps.push({ from: from, to: to }); });
    },
    'dep-del': function (el, api) { api.set(function (s) { s.model.deps.splice(Number(el.getAttribute('data-i')), 1); }); },

    /* check */
    ack: function (el, api) {
      var id = el.getAttribute('data-id');
      api.set(function (s) {
        var r = W.validate(s.model, { confirmed: s.confirmed }).filter(function (x) { return x.id === id; })[0];
        if (el.checked && r) s.acks[id] = r.sig; else delete s.acks[id];
      });
    },
    confirm: function (el, api) {
      api.set(function (s) { if (el.checked) s.confirmed[el.getAttribute('data-id')] = true; else delete s.confirmed[el.getAttribute('data-id')]; });
    },
    'goto': function (el, api) { api.go(Number(el.getAttribute('data-n'))); },

    /* land */
    mapping: function (el, api) { api.set(function (s) { s.model.options.mapping = el.getAttribute('data-k'); }); },
    option: function (el, api) { api.set(function (s) { s.model.options[el.getAttribute('data-k')] = el.checked; }); },
    'show-plan': function (el, api) {
      var plan = JSON.stringify(W.buildZohoPlan(api.state.model), null, 2);
      api.modal('<h3>What gets created</h3>' +
        '<p>The structure as an ordered list of things to create in Zoho Projects. <b>Nothing is sent from this page</b> — it is the specification the skill, or a developer, follows.</p>' +
        '<div class="btn-row" style="margin-top:0"><button class="btn small" data-act="copy-text" data-text="' + esc(plan) + '">Copy</button></div>' +
        '<div class="payload-preview">' + esc(plan) + '</div>');
    },
    'report-pdf': function (el, api) { if (api.state.lead) Land.openReport(reportHtml(api.state)); },
    'export-md': function (el, api) {
      if (!api.state.lead) return;
      api.download('wbs-' + slug(api.state) + '.md', W.renderReport(api.state.model, { confirmed: api.state.confirmed }), 'text/markdown;charset=utf-8;');
    },
    'export-csv': function (el, api) {
      var s = api.state;
      if (!s.lead) return;
      var o = W.outline(s.model), rows = [['Code', 'Element', 'Level', 'Role', 'Hours', 'Sample', 'Done means', 'Must finish first']];
      o.rows.forEach(function (r) {
        var before = s.model.deps.filter(function (d) { return d.to === r.id; }).map(function (d) { return (o.byId.get(d.from) || {}).code; }).filter(Boolean).join(' ');
        rows.push([r.code, r.node.title, r.depth + 2, r.isLeaf ? r.node.role : '', r.hours, r.isLeaf && r.node.sample ? 'yes' : '', r.isLeaf ? r.node.done : '', before]);
      });
      api.download('wbs-' + slug(s) + '.csv', api.csv(rows), 'text/csv;charset=utf-8;');
    },

    how: function (el, api) {
      api.modal('<h3>How this works</h3>' +
        '<p>No AI model runs on this page. The same choices always give the same structure.</p>' +
        '<div class="payload-preview">You\n  │  pick a project type, name it, choose its branches\n  ▼\n' +
        'WBS engine              deterministic, covered by tests\n  ├─ numbered structure   (you can change every line)\n  ├─ hours added up       from work packages to the top\n  ├─ checks               each with its source\n  └─ Zoho Projects plan   what to create, in order\n  ▼\n' +
        'Your AI agent           the wbs-builder skill + your Zoho connection,\n                        one approval, then it creates a new project</div>' +
        '<p style="margin-top:14px">Checked against ' + esc(K.CHECKED_AGAINST.join(', ')) + '. What Zoho Projects can create was tested on a live portal.</p>');
    }
  };
  var landActions = Land.actions({
    prompt: function (s) { return W.buildAgentPrompt(s.model); },
    skillPage: '../skills/wbs-builder.html',
    zips: [{ href: '../downloads/wbs-builder.zip', label: 'wbs-builder.zip' }, { href: '../downloads/zoho-projects-api.zip', label: 'zoho-projects-api.zip' }]
  });
  Object.keys(landActions).forEach(function (k) { actions[k] = landActions[k]; });

  /* ---------- mount ---------- */

  window.PMWizard.mount({
    id: 'wbs-builder',
    version: 1,
    brand: { mark: 'WBS', title: 'WBS Builder', sub: 'PM Skills · wbs-builder' },
    header: [{ label: 'How it works', act: 'how' }],
    hint: function () { return 'Deterministic engine · your structure is saved in this browser'; },
    initialState: blank,
    actions: actions,
    onDone: function (api) {
      api.modal('<h3>Saved</h3><p>Your structure stays in this browser until you press Reset. Come back any time to change it or create it in Zoho Projects.</p>');
    },
    steps: [
      { id: 'template', title: 'Project type', render: renderTemplate, canAdvance: function (s) { return !!s.template; } },
      { id: 'details', title: 'Details', render: renderDetails, canAdvance: detailsDone },
      { id: 'structure', title: 'Structure', render: renderStructure, onEnter: syncModel,
        canAdvance: function (s) { return !!s.model && s.model.nodes.length > 0; } },
      { id: 'people', title: 'People & order', render: renderPeople, onEnter: syncModel },
      { id: 'check', title: 'Check', render: renderCheck, canAdvance: function (s) { return readiness(s).ready; } },
      { id: 'land', title: 'Land', render: renderLand }
    ]
  }, document.getElementById('root'));
})();
