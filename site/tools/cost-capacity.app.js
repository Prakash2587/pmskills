/* ============================================================================
 * Capacity & Cost Planner — the cost-capacity-optimization skill's guided tool.
 *
 * This file is only the skill's STEPS. The chrome, navigation, saved session,
 * one-question-at-a-time flow, modal and drag-reorder come from
 * ../wizard/wizard.js, the hand-off route and report gate on the last step from
 * ../wizard/land.js, and every number comes from the tested engine in
 * ../engine.bundle.js (PMEngine.planner). A new skill writes a file like this
 * one and reuses the other two unchanged.
 * ========================================================================== */
(function () {
  'use strict';

  var P = window.PMEngine.planner;
  var L = window.PMEngine.lead;
  var C = window.PMEngine.knowledge.catalog;
  var B = window.PMEngine.knowledge.benchmarks;
  var Land = window.PMLand;
  var esc = window.PMWizard.esc;

  var JURISDICTIONS = {
    eu: 'European Union', france: 'France', germany: 'Germany', uk: 'United Kingdom', india: 'India',
    uae: 'United Arab Emirates', saudi: 'Saudi Arabia', california: 'California (US)', japan: 'Japan', brazil: 'Brazil'
  };
  var INTERNAL = 'internal';
  var PAY_GIST = {
    time_and_materials: 'The client pays for the hours worked',
    fixed_fee: 'One agreed price, whatever the hours',
    retainer: 'A set number of hours each period',
    milestone: 'Paid when a milestone is accepted',
    outcome: 'Paid on results, not effort',
    internal: 'Internal work — nobody is invoiced'
  };
  var HORIZONS = [4, 8, 12, 26];

  /* ---------- state ---------- */

  function blank() {
    return {
      step: 0, scenario: null, touched: false, seq: 100,
      org: { name: '', industry: '', billingModel: '', weekPattern: 'mon_fri', workDays: [1, 2, 3, 4, 5],
        hoursPerDay: 8, jurisdiction: '', currency: 'USD', horizonWeeks: 12, genericLabels: false },
      ctx: { answered: {}, active: null },
      people: [], work: [], budget: { amount: 0, spent: 0 }, budgetHint: null,
      steps: [], planOpts: {}, planStale: true, refineLog: [], lead: null
    };
  }
  // Everything the engine sees goes through here, so a blank name is the same
  // "Consultant #3" on every screen, in the report and in the payload.
  function inputOf(s) { return P.withLabels({ org: s.org, people: s.people, work: s.work, budget: s.budget }); }
  function hrs(n) { return (Math.round(n * 10) / 10) + 'h'; }
  // The engine's formatter, not a second one: the currency cannot differ between screens.
  function money(s, n) { return P.money({ org: s.org }, n); }
  function sym(s) { return P.currencySymbol(s.org).trim(); }
  function internal(s) { return s.org.billingModel === INTERNAL; }
  function dirty(s) { s.planStale = true; s.touched = true; }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function opt(v, label, cur) {
    return '<option value="' + esc(v) + '"' + (String(cur == null ? '' : cur) === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>';
  }
  function numAttr(v) { return v === 0 || v ? esc(v) : ''; }
  function focusOk() {
    var ok = document.querySelector('#wz-q [data-shell="q-ok"]');
    if (ok) ok.focus();
  }

  /* ---------- 1. Problem ---------- */

  function renderScenario(el, api) {
    var s = api.state;
    el.innerHTML =
      '<h2 class="step-title">What are you trying to fix?</h2>' +
      '<p class="step-sub">Pick the closest one. Each loads a sample team, which you then replace with your own.</p>' +
      '<div class="templates">' + C.SCENARIOS.map(function (sc) {
        return '<div class="tpl-card ' + (s.scenario === sc.key ? 'selected' : '') + '" data-act="scenario" data-k="' + sc.key + '">' +
          '<h3>' + esc(sc.title) + '</h3><p>' + esc(sc.tagline) + '</p><div class="tpl-meta">' +
          sc.chips.map(function (c) { return '<span class="chip accent">' + esc(c) + '</span>'; }).join('') +
          '<span class="chip">' + sc.people.length + ' people</span><span class="chip">' + sc.work.length + ' work items</span>' +
          '</div></div>';
      }).join('') + '</div>';
  }

  /* ---------- 2. Context — asked one question at a time ---------- */

  function payOptions() {
    return Object.keys(B.BILLING_MODELS).map(function (k) {
      return { key: k, label: cap(B.BILLING_MODELS[k].label), gist: PAY_GIST[k] || '' };
    }).concat([{ key: INTERNAL, label: 'Not client-billed', gist: PAY_GIST.internal }]);
  }
  function industryOf(s) { return C.INDUSTRIES.filter(function (i) { return i.key === s.org.industry; })[0]; }
  function patternOf(s) {
    return C.WEEK_PATTERNS.filter(function (p) { return p.key === s.org.weekPattern; })[0] || C.WEEK_PATTERNS[0];
  }
  function weekLine(s) {
    var cal = P.weekHours(s.org);
    return '<b>' + cal.days.map(function (d) { return C.DAY_NAMES[d].slice(0, 3); }).join(' · ') + '</b>, ' +
      esc(s.org.hoursPerDay) + 'h a day — a <b>' + hrs(cal.hours) + '</b> week';
  }

  function contextQuestions(s) {
    var o = s.org;
    var qs = [];

    qs.push({
      id: 'industry', label: 'Kind of work',
      prompt: 'First — what kind of work does your team do?',
      hint: 'This decides whether a published benchmark exists for you, and whether a billable ratio means anything at all.',
      body: function () {
        var groups = [];
        C.INDUSTRIES.forEach(function (i) { if (groups.indexOf(i.group) === -1) groups.push(i.group); });
        var ind = industryOf(s), band = ind && ind.band && B.UTILISATION[ind.band];
        var note = !ind ? ''
          : ind.billable === false ? 'Teams like this rarely bill by the hour, so capacity and cost are what get measured.'
          : band && band.provenance === 'sourced' ? 'A published benchmark exists for this sector: <b>' + esc(band.source.name) + '</b>.'
          : 'No published utilisation benchmark exists for this sector. You are compared with your own numbers, never a made-up target.';
        return '<select data-change="org" data-k="industry" data-autofocus>' + opt('', 'Choose the closest match…', o.industry) +
          groups.map(function (g) {
            return '<optgroup label="' + esc(g) + '">' + C.INDUSTRIES.filter(function (i) { return i.group === g; })
              .map(function (i) { return opt(i.key, i.label, o.industry); }).join('') + '</optgroup>';
          }).join('') + '</select>' + (note ? '<div class="q-note">' + note + '</div>' : '');
      },
      answer: function () { var ind = industryOf(s); return '<b>' + esc(ind ? ind.label : '—') + '</b>'; },
      valid: function () { return o.industry ? true : 'Pick the closest match — “Something else” is fine.'; }
    });

    qs.push({
      id: 'pay', label: 'How it is paid for',
      prompt: 'And how is that work paid for?',
      hint: 'The same hours mean something different under each of these, so nothing is assumed for you.',
      body: function () {
        return '<div class="choices">' + payOptions().map(function (p, i) {
          var key = String.fromCharCode(65 + i);
          return '<button type="button" class="choice' + (o.billingModel === p.key ? ' on' : '') + '" data-act="pay" data-k="' + p.key +
            '" data-key="' + key + '"><kbd>' + key + '</kbd><div><b>' + esc(p.label) + '</b><span>' + esc(p.gist) + '</span></div></button>';
        }).join('') + '</div>';
      },
      answer: function () {
        if (internal(s)) return '<b>Not client-billed</b> — capacity and delivery are what count, so budget and billing questions are skipped';
        var bm = B.BILLING_MODELS[o.billingModel];
        return bm ? '<b>' + esc(cap(bm.label)) + '</b> — what to watch: ' + esc(bm.keyMetric) : '—';
      },
      valid: function () { return o.billingModel ? true : 'Pick one — the plan reads your hours differently for each.'; }
    });

    qs.push({
      id: 'week', label: 'Working week',
      prompt: 'Which days does the team work?',
      hint: 'A “weekend” is not Saturday–Sunday everywhere, and every capacity figure is measured against this.',
      body: function () {
        var days = '';
        if (o.weekPattern === 'custom') {
          days = '<div class="checkbox-grid">' + C.DAY_NAMES.map(function (d, i) {
            var on = o.workDays.indexOf(i) !== -1;
            return '<label class="cb ' + (on ? 'on' : '') + '"><input type="checkbox" data-change="org-day" data-d="' + i + '"' +
              (on ? ' checked' : '') + '> ' + d.slice(0, 3) + '</label>';
          }).join('') + '</div>';
        }
        return '<div class="pills">' + C.WEEK_PATTERNS.map(function (p) {
          return '<button type="button" class="pill-btn' + (o.weekPattern === p.key ? ' on' : '') + '" data-act="week" data-k="' + p.key + '">' +
            esc(p.label.replace(' — pick the days', '')) + '</button>';
        }).join('') + '</div>' + days +
          '<div class="q-inline">about <input type="number" min="1" max="24" step="0.5" value="' + numAttr(o.hoursPerDay) +
            '" data-input="org-num" data-k="hoursPerDay" data-autofocus> hours a day &nbsp;=&nbsp; <b id="week-total">' + hrs(P.weekHours(o).hours) + '</b> a week</div>' +
          '<div class="q-note">' + esc(patternOf(s).where) + '</div>';
      },
      answer: function () { return weekLine(s); },
      valid: function () { return o.hoursPerDay >= 1 && o.hoursPerDay <= 24 ? true : 'Hours a day should be between 1 and 24.'; }
    });

    qs.push({
      id: 'horizon', label: 'Planning ahead',
      prompt: 'How many weeks ahead are you planning?',
      hint: 'How long this allocation is expected to hold. Overload only counts as “sustained” from three weeks.',
      body: function () {
        return '<div class="pills">' + HORIZONS.map(function (n) {
          return '<button type="button" class="pill-btn' + (Number(o.horizonWeeks) === n ? ' on' : '') + '" data-act="horizon" data-n="' + n + '">' + n + ' weeks</button>';
        }).join('') + '</div><div class="q-inline">or <input type="number" min="1" max="104" value="' + numAttr(o.horizonWeeks) +
          '" data-input="org-num" data-k="horizonWeeks" data-autofocus> weeks</div>';
      },
      answer: function () { return '<b>' + esc(o.horizonWeeks) + ' weeks</b> ahead'; },
      valid: function () { return o.horizonWeeks >= 1 && o.horizonWeeks <= 104 ? true : 'Between 1 and 104 weeks.'; }
    });

    qs.push({
      id: 'currency', label: 'Currency',
      prompt: 'Which currency are your rates in?',
      hint: 'Every figure from here on — rates, weekly cost, budget, the report — is shown in it.',
      body: function () {
        return '<div class="pills">' + C.CURRENCIES.map(function (c) {
          return '<button type="button" class="pill-btn' + (o.currency === c.code ? ' on' : '') + '" data-act="currency" data-k="' + c.code + '">' +
            esc(c.symbol.trim()) + (c.symbol.trim() === c.code ? '' : ' <small>' + c.code + '</small>') + '</button>';
        }).join('') + '</div>';
      },
      answer: function () {
        var c = C.CURRENCIES.filter(function (x) { return x.code === o.currency; })[0];
        return '<b>' + esc(sym(s)) + '</b>' + (c ? ' — ' + esc(c.name) : '');
      }
    });

    // Internal work is planned on capacity, so there is no budget to ask about.
    if (!internal(s)) {
      qs.push({
        id: 'budget', label: 'Budget', optional: true,
        prompt: 'Is there a budget for this work?',
        hint: 'Add it and you get a forecast against it. Skip it and the plan covers capacity only.',
        body: function () {
          var h = s.budgetHint, cur = esc(sym(s));
          var eg = function (n) { return 'e.g. ' + Math.round(n).toLocaleString('en-US'); };
          return '<div class="q-pair">' +
            '<div><label for="q-budget">Budget for this work</label><span class="money-in"><span>' + cur + '</span><input id="q-budget" type="number" min="0" step="1000" value="' +
              (s.budget.amount ? esc(s.budget.amount) : '') + '" placeholder="' + eg(h ? h.amount : 120000) + '" data-input="budget" data-k="amount" data-autofocus></span></div>' +
            '<div><label for="q-spent">Spent so far</label><span class="money-in"><span>' + cur + '</span><input id="q-spent" type="number" min="0" step="1000" value="' +
              (s.budget.spent ? esc(s.budget.spent) : '') + '" placeholder="' + eg(h ? h.spent : 78000) + '" data-input="budget" data-k="spent"></span></div></div>' +
            (h ? '<div class="q-note">Just exploring? <a data-act="budget-sample" style="cursor:pointer">Use the sample figures</a> — ' +
              money(s, h.amount) + ' budget, ' + money(s, h.spent) + ' spent.</div>' : '');
        },
        answer: function () {
          return s.budget.amount > 0
            ? '<b>' + money(s, s.budget.amount) + '</b> budget, <b>' + money(s, s.budget.spent) + '</b> spent so far'
            : 'No budget — the plan covers capacity only';
        },
        valid: function () { return s.budget.spent > 0 && !(s.budget.amount > 0) ? 'Add the budget too, or clear “spent so far”.' : true; },
        onSkip: function (st) { st.budget = { amount: 0, spent: 0 }; }
      });
    }

    qs.push({
      id: 'where', label: 'Based in', optional: true,
      prompt: 'Where is the team based?',
      hint: 'Only used to name the working-time rules worth checking. This tool does not assess compliance.',
      body: function () {
        return '<select data-change="org" data-k="jurisdiction" data-autofocus>' + opt('', 'Prefer not to say', o.jurisdiction) +
          Object.keys(JURISDICTIONS).map(function (k) { return opt(k, JURISDICTIONS[k], o.jurisdiction); }).join('') + '</select>';
      },
      answer: function () { return o.jurisdiction ? '<b>' + esc(JURISDICTIONS[o.jurisdiction]) + '</b>' : 'Not given'; },
      onSkip: function (st) { st.org.jurisdiction = ''; }
    });

    qs.push({
      id: 'name', label: 'Team name', optional: true,
      prompt: 'Last one — what should we call this team?',
      hint: 'It only titles your report. A nickname is fine, and so is nothing at all.',
      body: function () {
        return '<input type="text" value="' + esc(o.name) + '" placeholder="e.g. Delivery team" data-input="org-text" data-k="name" data-autofocus>';
      },
      answer: function () { return o.name ? '<b>' + esc(o.name) + '</b>' : 'No name — the report is simply untitled'; },
      onSkip: function (st) { st.org.name = ''; }
    });

    return qs;
  }

  function renderContext(el, api) {
    api.convo(el, {
      key: 'ctx',
      title: 'A few quick questions',
      sub: 'They decide how your numbers are read. Click any answer to change it.',
      questions: contextQuestions(api.state),
      done: '<b>That is the setting.</b> Next: who is on the team, and what each person is carrying.'
    });
  }
  function contextDone(s) {
    return window.PMWizard.convoDone(s.ctx, contextQuestions(s).map(function (q) { return q.id; }));
  }

  /* ---------- 3. Team & work ---------- */

  function teamTotals(s) {
    var inp = inputOf(s), load = P.computeLoad(inp.people, inp.work), t = load.totals, cal = P.weekHours(s.org);
    var over = load.rows.filter(function (r) { return r.over > 0; });
    var pe = document.getElementById('tw-people'), we = document.getElementById('tw-work');
    if (pe) pe.innerHTML = '<b>' + t.people + '</b> people · <b>' + hrs(t.capacity) + '</b> weekly capacity · working week is ' + hrs(cal.hours);
    if (we) we.innerHTML = '<b>' + hrs(t.allocated) + '</b> allocated' +
      (over.length ? ' · <span class="bad">over capacity: ' + over.map(function (r) { return esc(r.name) + ' +' + hrs(r.over); }).join(', ') + '</span>' : '') +
      (t.unassignedHours > 0 ? ' · <span class="bad">' + hrs(t.unassignedHours) + ' unowned</span>' : '');
  }

  // Generic references depend on every row (the third consultant is "#3"), so they are
  // refreshed in place as rows are edited — without re-rendering what is being typed in.
  function relabel(s) {
    var inp = inputOf(s), gen = s.org.genericLabels;
    var by = function (list) { var m = {}; list.forEach(function (x) { m[x.id] = x; }); return m; };
    var people = by(inp.people), work = by(inp.work);
    [].forEach.call(document.querySelectorAll('[data-label]'), function (el) {
      var kind = el.getAttribute('data-label'), id = el.getAttribute('data-id');
      var text = kind === 'person' ? (people[id] || {}).name : kind === 'project' ? (work[id] || {}).project : (work[id] || {}).title;
      if (text == null) return;
      if (el.tagName === 'OPTION') el.textContent = text;
      else if (gen && kind !== 'title') el.value = text;
      else el.placeholder = text;
    });
  }

  function renderTeam(el, api) {
    var s = api.state, inp = inputOf(s), int = internal(s), gen = s.org.genericLabels, cur = esc(sym(s));
    var roles = [];
    s.people.forEach(function (p) { if (p.role && roles.indexOf(p.role) === -1) roles.push(p.role); });
    var label = {};
    inp.people.forEach(function (p) { label[p.id] = p.name; });

    var people = s.people.map(function (p) {
      var c = function (k, cls) {
        return '<td class="cell ' + (cls || '') + '"><input type="' + (k === 'role' ? 'text' : 'number" min="0" step="any') + '"' +
          (k === 'role' ? ' list="roles" placeholder="Role"' : '') + ' value="' + numAttr(p[k]) + '" data-change="person" data-id="' + p.id + '" data-k="' + k + '"></td>';
      };
      return '<tr><td class="cell"><input type="text" data-label="person" data-change="person" data-id="' + p.id + '" data-k="name"' +
        (gen ? ' disabled value="' + esc(label[p.id]) + '"' : ' value="' + esc(p.name) + '" placeholder="' + esc(label[p.id]) + '"') + '></td>' +
        c('role') + c('capacity', 'num') + c('costRate', 'num') + (int ? '' : c('billRate', 'num')) +
        '<td class="ops"><button class="x-btn" title="Remove" data-act="del-person" data-id="' + p.id + '">×</button></td></tr>';
    }).join('');

    var work = s.work.map(function (w, i) {
      var owner = s.people.filter(function (p) { return p.id === w.owner; })[0];
      var lw = inp.work[i];
      return '<tr>' +
        '<td class="cell"><input type="text" data-label="title" value="' + esc(w.title) + '" placeholder="' + esc(lw.title) + '" data-change="work" data-id="' + w.id + '" data-k="title"></td>' +
        '<td class="cell"><input type="text" data-label="project" data-change="work" data-id="' + w.id + '" data-k="project"' +
          (gen ? ' disabled value="' + esc(lw.project) + '"' : ' value="' + esc(w.project || '') + '" placeholder="' + esc(lw.project) + '"') + '></td>' +
        '<td class="cell"><select data-change="work" data-id="' + w.id + '" data-k="owner">' + opt('', 'Unowned', w.owner || '') +
          s.people.map(function (p) {
            return '<option data-label="person" data-id="' + p.id + '" value="' + esc(p.id) + '"' + (w.owner === p.id ? ' selected' : '') + '>' + esc(label[p.id]) + '</option>';
          }).join('') + '</select></td>' +
        '<td class="cell"><input type="text" list="roles" value="' + esc(w.role || '') + '" placeholder="' + esc(owner ? owner.role || 'Any' : 'Role needed') + '" data-change="work" data-id="' + w.id + '" data-k="role"></td>' +
        '<td class="cell num"><input type="number" min="0" step="any" value="' + numAttr(w.hours) + '" data-change="work" data-id="' + w.id + '" data-k="hours"></td>' +
        (int ? '' : '<td class="chk"><input type="checkbox"' + (w.billable ? ' checked' : '') + ' data-change="work" data-id="' + w.id + '" data-k="billable"></td>') +
        '<td class="ops"><button class="x-btn" title="Remove" data-act="del-work" data-id="' + w.id + '">×</button></td></tr>';
    }).join('');

    el.innerHTML =
      '<h2 class="step-title">Who is on the team, and what are they carrying?</h2>' +
      '<p class="step-sub">A typical week is enough, and rough numbers are fine.</p>' +
      '<label class="privacy"><input type="checkbox" data-change="generic"' + (gen ? ' checked' : '') + '>' +
        '<div><b>Keep real names out of it</b><span>People show as “' + esc(inp.people[0] && gen ? inp.people[0].name : 'Consultant #1') +
        '” and projects as “Project #1” everywhere, including the report. Untick to bring your names back.</span></div></label>' +
      '<p class="aside">Names and project names are optional either way — leave one blank and it shows as a role and number.</p>' +
      '<div class="sec-row" style="margin-top:28px"><h3 class="sec">People</h3>' +
        (s.people.length || s.work.length ? '<button class="btn small ghost" data-act="clear-sample">Clear all and start empty</button>' : '') + '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>Name <i>optional</i></th><th>Role</th><th>Capacity <i>h/week</i></th><th>Cost / hour <i>' + cur + '</i></th>' +
        (int ? '' : '<th>Bill / hour <i>' + cur + '</i></th>') + '<th></th></tr></thead>' +
        '<tbody id="tb-people">' + (people || '<tr><td colspan="6" class="plan-empty">No people yet. Add the first one — a role is enough.</td></tr>') + '</tbody></table></div>' +
      '<div class="table-foot"><button class="btn small" data-act="add-person">+ Add person</button><div class="totals" id="tw-people"></div></div>' +
      '<h3 class="sec">Work — hours per week</h3>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>Work item</th><th>Project / client <i>optional</i></th><th>Owner</th><th>Role needed</th><th>Hours/week</th>' +
        (int ? '' : '<th>Billable</th>') + '<th></th></tr></thead>' +
        '<tbody id="tb-work">' + (work || '<tr><td colspan="7" class="plan-empty">No work yet.</td></tr>') + '</tbody></table></div>' +
      '<div class="table-foot"><button class="btn small" data-act="add-work">+ Add work item</button><div class="totals" id="tw-work"></div></div>' +
      '<datalist id="roles">' + roles.map(function (r) { return '<option value="' + esc(r) + '">'; }).join('') + '</datalist>';
    teamTotals(s);
  }

  /* ---------- 4. Plan ---------- */

  function bar(label, row, max, plan) {
    var over = row.over > 0;
    return '<div class="bar"><span>' + label + '</span><div class="track">' +
      '<div class="fill' + (plan ? ' plan' : '') + (over ? ' over' : '') + '" style="width:' + Math.min(100, row.allocated / max * 100).toFixed(1) + '%"></div>' +
      '<div class="capmark" style="left:' + Math.min(100, row.capacity / max * 100).toFixed(1) + '%"></div></div>' +
      '<span class="val' + (over ? ' over' : '') + '">' + hrs(row.allocated) + ' / ' + hrs(row.capacity) + '</span></div>';
  }

  function stepEditor(st, inp, people) {
    var f = function (k) { return ' data-change="step-field" data-id="' + esc(st.id) + '" data-k="' + k + '"'; };
    var items = '<select' + f('workId') + '>' + inp.work.map(function (w) {
      return opt(w.id, w.title + (w.project ? ' — ' + w.project : ''), st.workId);
    }).join('') + '</select>';
    if (st.kind === 'hire') {
      return '<input type="text" value="' + esc(st.role || '') + '" placeholder="Role"' + f('role') + '>' +
        '<input type="number" min="1" step="any" value="' + numAttr(st.capacity) + '" title="Hours per week"' + f('capacity') + '><span class="arrow">h/week at ' + esc(P.currencySymbol(inp.org).trim()) + '</span>' +
        '<input type="number" min="0" step="any" value="' + numAttr(st.costRate) + '" title="Cost per hour"' + f('costRate') + '><span class="arrow">/hour</span>';
    }
    var hours = '<input type="number" min="0" step="any" value="' + numAttr(st.hours) + '" title="Hours per week"' + f('hours') + '><span class="arrow">h/week</span>';
    if (st.kind === 'descope') return items + hours;
    return items + hours + '<span class="arrow">→</span><select' + f('to') + '>' +
      people.map(function (p) { return opt(p.id, p.name + (p.role ? ' (' + p.role + ')' : ''), st.to); }).join('') + '</select>';
  }

  function renderPlan(el, api) {
    var s = api.state, inp = inputOf(s), a = P.assess(inp, s.steps, s.planOpts);
    var t0 = a.before.totals, t1 = a.after.totals;
    var problem = t0.overHours + t0.unassignedHours, left = a.residual.overHours + a.residual.unassignedHours;
    var max = 1;
    a.before.rows.concat(a.after.rows).forEach(function (r) { max = Math.max(max, r.allocated, r.capacity); });

    var bars = a.after.rows.map(function (r) {
      var was = a.before.rows.filter(function (x) { return x.id === r.id; })[0];
      return '<div class="load-row"><div class="who"><b>' + esc(r.name) + '</b><span>' + esc(r.role || 'No role') +
        (r.isHire ? ' · proposed hire' : '') + '</span></div><div>' + (was ? bar('Now', was, max, false) : '') + bar('Plan', r, max, true) + '</div></div>';
    }).join('');

    var findings = a.findings.map(function (f) {
      return '<div class="find"><span class="pill g-' + f.grade + '">' + f.grade + '</span><div><b>' + esc(f.headline) + '</b><p>' + esc(f.detail) + '</p></div></div>';
    }).join('');

    var stat = function (label, value, cls, small) {
      return '<div class="stat ' + (cls || '') + '"><span>' + label + '</span><b>' + value + '</b>' + (small ? '<small>' + small + '</small>' : '') + '</div>';
    };
    var stats = stat('People', t1.people) + stat('Capacity', hrs(t1.capacity), '', 'a week') + stat('Allocated', hrs(t1.allocated), '', 'a week') +
      stat('Over capacity', hrs(t0.overHours) + ' → ' + hrs(t1.overHours), t1.overHours > 0 ? 'bad' : 'good', 'now → plan') +
      (t0.unassignedHours > 0 ? stat('Unowned', hrs(t0.unassignedHours) + ' → ' + hrs(t1.unassignedHours), t1.unassignedHours > 0 ? 'bad' : 'good', 'now → plan') : '') +
      (t1.weeklyCost > 0 ? stat('Weekly cost', money(s, t1.weeklyCost)) : '') +
      (a.budget ? stat('Forecast', money(s, a.budget.after.forecast), a.budget.after.over > 0 ? 'bad' : 'good', 'of ' + money(s, a.budget.after.amount)) : '');

    // Examples are built from this team, so every one of them works when clicked.
    var egs = [];
    var roomiest = a.before.rows.filter(function (r) { return inp.work[0] && r.id !== inp.work[0].owner; })
      .sort(function (x, y) { return y.spare - x.spare; })[0];
    if (inp.work[0] && roomiest) egs.push('move ' + inp.work[0].title + ' to ' + roomiest.name);
    egs.push('same role only');
    if (inp.work[0]) egs.push('descope ' + inp.work[0].title + ' by 4h');
    egs.push('hire a ' + ((inp.people[0] && inp.people[0].role) || 'Developer'));
    egs.push('reset plan');

    var issues = {};
    a.applied.issues.forEach(function (i) { issues[i.stepId] = i.msg; });
    var rows = s.steps.map(function (st, i) {
      return '<div class="plan-row' + (issues[st.id] ? ' skipped' : '') + '" draggable="true" data-drag-id="' + esc(st.id) + '">' +
        '<span class="grip" title="Drag to reorder">⋮⋮</span><span class="n">' + (i + 1) + '</span>' +
        '<div><div class="plan-text">' + esc(P.describeStep(st, inp)) + '</div>' +
        '<div class="plan-edit">' + stepEditor(st, inp, a.applied.people) + '</div>' +
        (issues[st.id] ? '<div class="plan-issue">Skipped: ' + esc(issues[st.id]) + '.</div>' : '') + '</div>' +
        '<div class="plan-ops">' +
          '<button class="x-btn" title="Move up" data-act="step-up" data-id="' + esc(st.id) + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="x-btn" title="Move down" data-act="step-down" data-id="' + esc(st.id) + '"' + (i === s.steps.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button class="x-btn" title="Remove step" data-act="step-del" data-id="' + esc(st.id) + '">×</button></div></div>';
    }).join('');

    var residual;
    if (left > 0) {
      residual = '<div class="residual open"><b>Still unresolved after this plan: ' + hrs(left) + '/week</b><ul>' +
        a.residual.people.map(function (p) { return '<li>' + esc(p.name) + ' is still ' + hrs(p.over) + '/week over capacity</li>'; }).join('') +
        a.residual.work.map(function (w) { return '<li>' + esc(w.title) + ': ' + hrs(w.hours) + '/week with no owner' + (w.role ? ' (needs ' + esc(w.role) + ')' : '') + '</li>'; }).join('') +
        '</ul><div class="levers">' + (a.residual.absorbable
          ? 'The team still has room for some of this. Add a <b>Move work</b> step, or press <b>Regenerate plan</b>.'
          : 'Nobody on the team has room for this. The honest levers are <b>scope</b> (descope work), <b>date</b> (accept that it takes longer) or <b>headcount</b> (add a hire) — not asking the same people for more hours.') +
        '</div></div>';
    } else {
      residual = '<div class="residual closed">' + (problem > 0 ? 'Every hour of overload and unowned work has a home in this plan.' : 'The load already fits capacity. Nothing needs to move.') + '</div>';
    }

    var log = s.refineLog.map(function (r) {
      return '<div class="entry' + (r.ok ? '' : ' miss') + '"><b>' + esc(r.text) + '</b> — ' + esc(r.summary) + '</div>';
    }).join('');

    el.innerHTML =
      '<h2 class="step-title">Your plan</h2>' +
      '<p class="step-sub">Edit, reorder or remove any step. Everything recalculates as you go.</p>' +
      '<div class="verdict">' + esc(a.headline) + '</div>' +
      '<div class="stats">' + stats + '</div>' +

      '<h3 class="sec">Team load — now, and after the plan</h3><div class="load">' + bars + '</div>' +
      '<div class="legend">The marker is each person\'s weekly capacity. Red is allocated above it.</div>' +

      '<div class="sec-row"><h3 class="sec">The plan</h3><button class="btn small ghost" data-act="regen">Regenerate plan</button></div>' +
      '<div class="plan" data-drop="reorder">' + (rows || '<div class="plan-empty">No steps. Add one below, or regenerate.</div>') + '</div>' +
      '<div class="plan-add"><button class="btn small" data-act="add-move">+ Move work</button>' +
        '<button class="btn small" data-act="add-descope">+ Descope work</button>' +
        '<button class="btn small" data-act="add-hire">+ Add a hire</button></div>' +
      residual +

      '<h3 class="sec">Or change it in words</h3>' +
      '<div class="refine-box"><input type="text" id="refine-input" data-enter="refine" placeholder="Type a command, or pick an example below">' +
        '<button class="btn" data-act="refine">Apply</button></div>' +
      '<div class="refine-egs">Try' + egs.map(function (e) { return '<button type="button" data-act="refine-eg">' + esc(e) + '</button>'; }).join('') + '</div>' +
      (log ? '<div class="refine-log">' + log + '</div>' : '') +

      '<h3 class="sec">Where things stand today</h3>' + (findings ? '<div class="finds">' + findings + '</div>' : '<div class="plan-empty">Nothing to report.</div>') +
      '<div class="legend"><b>Reported</b> is a number you typed. <b>Derived</b> is arithmetic on it. Nothing here is measured yet.</div>';
  }

  /* ---------- 5. Validate ---------- */

  function renderValidate(el, api) {
    var s = api.state, results = P.validate(inputOf(s), s.steps);
    var n = { pass: 0, warn: 0, fail: 0 };
    results.forEach(function (r) { n[r.state]++; });
    el.innerHTML =
      '<h2 class="step-title">Validation</h2>' +
      '<p class="step-sub"><b>' + n.pass + ' pass · ' + n.warn + ' warn · ' + n.fail + ' fail.</b> ' +
        (n.fail ? 'A failure does not lock you out — <a data-act="goto-plan" style="cursor:pointer">fix it in the plan</a>, or carry on knowing it is there.' : 'Nothing is blocking this plan.') + '</p>' +
      '<div class="val-grid">' + results.map(function (r) {
        return '<div class="val-card ' + r.state + '"><span class="status">' + r.state.toUpperCase() + '</span><h4>' + esc(r.rule) + '</h4><p>' + esc(r.detail) + '</p>' +
          (r.violations.length ? '<ul>' + r.violations.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ul>' : '') +
          '<div class="basis">' + esc(r.basis) + '</div></div>';
      }).join('') + '</div>';
  }

  /* ---------- 6. Land ---------- */

  function renderLand(el, api) {
    var s = api.state, inp = inputOf(s), features = P.buildFeatureMap(inp, s.steps);

    el.innerHTML =
      '<h2 class="step-title">Put this plan to work</h2>' +
      '<p class="step-sub">So far it is an estimate from numbers you typed. In Zoho Projects it becomes measured.</p>' +

      Land.route(s, { text: 'Your agent sets this plan up in Zoho Projects for you. It reads the real numbers first, shows where they differ from what you typed, and asks before every change.',
        promptTitle: 'Paste your plan into the agent', promptNote: 'It checks the real numbers, then asks before each change.' }) +

      '<h3 class="sec">Where each finding becomes a measured number</h3>' +
      '<div class="feature-list">' + features.map(function (f) {
        return '<details class="feature"><summary><b>' + esc(f.name) + '<small>' + esc(f.tier) + '</small></b>' +
          '<span class="does">' + esc(f.does) + '</span>' +
          '<span class="count">' + f.covers.length + (f.covers.length === 1 ? ' finding' : ' findings') + '</span></summary>' +
          '<ul>' + f.covers.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></details>';
      }).join('') + '</div>' +

      '<h3 class="sec">More ways to use this plan</h3>' +
      '<div class="more">' +
        '<div class="more-row"><div><b>Download the report</b><span class="note">The plan, the checks and the setup, to keep or share.</span></div>' +
          Land.downloads(s, [{ act: 'report-pdf', label: 'PDF' }, { act: 'export-md', label: 'Markdown' }, { act: 'export-csv', label: 'CSV' }]) + '</div>' +
        '<div class="more-row"><div><b>Set it up by hand</b><span class="note">The same plan as a short sequence to follow in Zoho Projects.</span></div>' +
          '<div class="more-acts"><button class="btn small" data-act="show-setup">View the steps</button></div></div>' +
        '<div class="more-row"><div><b>For developers</b><span class="note">The plan as Zoho Projects API data. Nothing is sent from this page.</span></div>' +
          '<div class="more-acts"><button class="btn small" data-act="show-payload">See the API payload</button></div></div>' +
      '</div>';
  }

  /* The report as a designed page. The browser's own "Save as PDF" makes the file,
   * so the text stays sharp and nothing has to be loaded to produce it. */
  function reportHtml(s) {
    var inp = inputOf(s), a = P.assess(inp, s.steps, s.planOpts), t0 = a.before.totals, t1 = a.after.totals;
    var ind = industryOf(s), bm = B.BILLING_MODELS[s.org.billingModel];
    var meta = [new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
      ind ? ind.label : '', internal(s) ? 'Not client-billed' : bm ? cap(bm.label) : '',
      hrs(P.weekHours(s.org).hours) + ' working week', s.org.horizonWeeks + ' weeks ahead'].filter(Boolean).join(' · ');
    var sec = function (title, body) { return '<section><h2>' + title + '</h2>' + body + '</section>'; };
    var stat = function (label, value) { return '<div><span>' + label + '</span><b>' + value + '</b></div>'; };

    return '<div class="r-top"><span>PM Skills · Capacity &amp; cost plan</span><span>Self-reported figures</span></div>' +
      '<h1>' + esc(s.org.name || 'Capacity and cost plan') + '</h1><p class="r-meta">' + esc(meta) + '</p>' +
      '<p class="r-verdict">' + esc(a.headline) + '</p>' +
      '<div class="r-stats">' + stat('People', t1.people) + stat('Capacity', hrs(t1.capacity)) + stat('Allocated', hrs(t1.allocated)) +
        stat('Over capacity', hrs(t0.overHours) + ' → ' + hrs(t1.overHours)) +
        (t1.weeklyCost > 0 ? stat('Weekly cost', money(s, t1.weeklyCost)) : '') +
        (a.budget ? stat('Forecast', money(s, a.budget.after.forecast)) + stat('Budget', money(s, a.budget.after.amount)) : '') + '</div>' +

      sec('The plan', s.steps.length
        ? '<ol>' + s.steps.map(function (st) { return '<li>' + esc(P.describeStep(st, inp)) + '</li>'; }).join('') + '</ol>'
        : '<p>No changes needed — the load already fits capacity.</p>') +

      sec('Team load', '<table><thead><tr><th>Person</th><th>Role</th><th>Now</th><th>After plan</th><th>Capacity</th></tr></thead><tbody>' +
        a.after.rows.map(function (r) {
          var was = a.before.rows.filter(function (x) { return x.id === r.id; })[0];
          return '<tr><td>' + esc(r.name) + (r.isHire ? ' <small>proposed hire</small>' : '') + '</td><td>' + esc(r.role) + '</td>' +
            '<td class="n' + (was && was.over > 0 ? ' over' : '') + '">' + (was ? hrs(was.allocated) : '—') + '</td>' +
            '<td class="n' + (r.over > 0 ? ' over' : '') + '">' + hrs(r.allocated) + '</td><td class="n">' + hrs(r.capacity) + '</td></tr>';
        }).join('') + '</tbody></table>') +

      sec('Where things stand today', '<ul>' + a.findings.map(function (f) {
        return '<li><b>' + esc(f.headline) + '</b> <span class="r-tag">' + f.grade + '</span><small>' + esc(f.detail) + '</small></li>';
      }).join('') + '</ul>') +

      sec('Checks', '<table><tbody>' + P.validate(inp, s.steps).map(function (v) {
        return '<tr><td><span class="r-tag ' + v.state + '">' + v.state + '</span></td><td><b>' + esc(v.rule) + '</b><small>' + esc(v.detail) +
          (v.violations.length ? ' ' + esc(v.violations.join('; ')) + '.' : '') + '</small></td></tr>';
      }).join('') + '</tbody></table>') +

      sec('Setting this up in Zoho Projects', '<ol>' + P.buildSetupSteps(inp, s.steps).map(function (st) {
        return '<li><b>' + esc(st.title) + '</b><small>' + esc(st.detail) + ' — ' + esc(st.featureName) + ', ' + esc(st.tier) + '</small></li>';
      }).join('') + '</ol>') +

      sec('Where each finding becomes a measured number', '<ul>' + P.buildFeatureMap(inp, s.steps).map(function (f) {
        return '<li><b>' + esc(f.name) + '</b> <span class="r-tag">' + esc(f.tier) + '</span><small>' + esc(f.does) + '</small></li>';
      }).join('') + '</ul>') +

      '<p class="r-foot">Built from self-reported figures. Nothing here is measured. Reported means a number that was typed in; derived means arithmetic on it.</p>';
  }

  /* ---------- actions ---------- */

  function findStep(s, id) { return s.steps.filter(function (x) { return x.id === id; })[0]; }
  function moveStep(s, from, to) {
    if (from < 0 || to < 0 || from >= s.steps.length || to >= s.steps.length) return;
    s.steps.splice(to, 0, s.steps.splice(from, 1)[0]);
  }
  function indexOfStep(s, id) { for (var i = 0; i < s.steps.length; i++) if (s.steps[i].id === id) return i; return -1; }
  function slug(s) { return (s.org.name || 'team').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'team'; }

  var actions = {
    scenario: function (el, api) {
      var key = el.getAttribute('data-k'), cur = api.state;
      if (cur.touched && cur.scenario && !window.confirm('This replaces the team and work you have entered. Continue?')) return;
      api.set(function (s) {
        var sc = key === 'blank' ? null : JSON.parse(JSON.stringify(C.SCENARIOS.filter(function (x) { return x.key === key; })[0]));
        s.people = sc ? sc.people : [];
        s.work = sc ? sc.work : [];
        // A sample budget is only ever a hint on the budget question, never a value:
        // the forecast must come from a figure the user gave.
        s.budget = { amount: 0, spent: 0 };
        s.budgetHint = sc && sc.budget && sc.budget.amount ? sc.budget : null;
        if (sc) s.org.industry = sc.org.industry;
        // The sample changes these two answers, so they are asked again. How the work
        // is paid for is never pre-filled — that one is always the user's own answer.
        delete s.ctx.answered.industry; delete s.ctx.answered.budget; s.ctx.active = null;
        // Always reset: a horizon left over from the previous scenario would silently
        // change the forecast and the sustained-overload check.
        s.org.horizonWeeks = (sc && sc.horizonWeeks) || 12;
        s.scenario = key; s.steps = []; s.planOpts = {}; s.refineLog = []; s.planStale = true; s.touched = false;
      });
    },

    /* context */
    'org-text': function (el, api) { api.patch(function (s) { s.org[el.getAttribute('data-k')] = el.value.trim(); }); },
    'org-num': function (el, api) {
      var k = el.getAttribute('data-k');
      api.patch(function (s) { s.org[k] = Number(el.value) || 0; s.planStale = true; });
      var total = document.getElementById('week-total');
      if (total) total.textContent = hrs(P.weekHours(api.state.org).hours);
    },
    org: function (el, api) {
      api.set(function (s) { s.org[el.getAttribute('data-k')] = el.value; s.planStale = true; });
      focusOk();
    },
    pay: function (el, api) {
      api.answer('pay', function (s) { s.org.billingModel = el.getAttribute('data-k'); s.planStale = true; });
    },
    week: function (el, api) {
      api.set(function (s) {
        var prev = P.weekHours(s.org).days, key = el.getAttribute('data-k');
        s.org.weekPattern = key;
        if (key === 'custom') s.org.workDays = prev.slice();
        s.planStale = true;
      });
      focusOk();
    },
    'org-day': function (el, api) {
      var d = Number(el.getAttribute('data-d'));
      api.set(function (s) {
        var i = s.org.workDays.indexOf(d);
        if (i === -1) s.org.workDays.push(d); else if (s.org.workDays.length > 1) s.org.workDays.splice(i, 1);
        s.org.workDays.sort();
        s.planStale = true;
      });
    },
    horizon: function (el, api) {
      api.answer('horizon', function (s) { s.org.horizonWeeks = Number(el.getAttribute('data-n')); s.planStale = true; });
    },
    currency: function (el, api) {
      api.answer('currency', function (s) { s.org.currency = el.getAttribute('data-k'); });
    },
    budget: function (el, api) {
      api.patch(function (s) { s.budget[el.getAttribute('data-k')] = Math.max(0, Number(el.value) || 0); });
    },
    'budget-sample': function (el, api) {
      api.set(function (s) { if (s.budgetHint) s.budget = { amount: s.budgetHint.amount, spent: s.budgetHint.spent }; });
      focusOk();
    },

    /* team & work */
    generic: function (el, api) { api.set(function (s) { s.org.genericLabels = el.checked; }); },
    person: function (el, api) {
      var id = el.getAttribute('data-id'), k = el.getAttribute('data-k');
      api.patch(function (s) {
        var p = s.people.filter(function (x) { return x.id === id; })[0];
        if (!p) return;
        p[k] = (k === 'name' || k === 'role') ? el.value.trim() : Math.max(0, Number(el.value) || 0);
        dirty(s);
      });
      relabel(api.state);
      teamTotals(api.state);
    },
    work: function (el, api) {
      var id = el.getAttribute('data-id'), k = el.getAttribute('data-k');
      api.patch(function (s) {
        var w = s.work.filter(function (x) { return x.id === id; })[0];
        if (!w) return;
        if (k === 'hours') w.hours = Math.max(0, Number(el.value) || 0);
        else if (k === 'billable') w.billable = el.checked;
        else if (k === 'owner') w.owner = el.value || null;
        else w[k] = el.value.trim();
        dirty(s);
      });
      relabel(api.state);
      teamTotals(api.state);
    },
    'clear-sample': function (el, api) {
      if (!window.confirm('Remove every person and work item, and start with an empty team?')) return;
      api.set(function (s) { s.people = []; s.work = []; s.steps = []; s.refineLog = []; s.planOpts = {}; dirty(s); });
    },
    'add-person': function (el, api) {
      api.set(function (s) {
        s.people.push({ id: 'p' + (s.seq++), name: '', role: '', capacity: P.weekHours(s.org).hours, costRate: 0, billRate: 0 });
        dirty(s);
      });
      // Role first: it is the one thing a generic reference needs.
      var last = document.querySelector('#tb-people tr:last-child input[data-k="role"]');
      if (last) last.focus();
    },
    'add-work': function (el, api) {
      api.set(function (s) {
        var ind = industryOf(s);
        s.work.push({ id: 'w' + (s.seq++), title: '', project: '', owner: null, role: '', hours: 8,
          billable: !internal(s) && !!(ind && ind.billable === true) });
        dirty(s);
      });
      var last = document.querySelector('#tb-work tr:last-child input');
      if (last) last.focus();
    },
    'del-person': function (el, api) {
      var id = el.getAttribute('data-id');
      api.set(function (s) {
        s.people = s.people.filter(function (p) { return p.id !== id; });
        s.work.forEach(function (w) { if (w.owner === id) w.owner = null; });
        dirty(s);
      });
    },
    'del-work': function (el, api) {
      var id = el.getAttribute('data-id');
      api.set(function (s) { s.work = s.work.filter(function (w) { return w.id !== id; }); dirty(s); });
    },

    /* plan */
    'step-field': function (el, api) {
      var id = el.getAttribute('data-id'), k = el.getAttribute('data-k');
      api.set(function (s) {
        var st = findStep(s, id);
        if (!st) return;
        st[k] = (k === 'hours' || k === 'capacity' || k === 'costRate') ? Math.max(0, Number(el.value) || 0) : el.value;
      });
    },
    'step-up': function (el, api) { api.set(function (s) { var i = indexOfStep(s, el.getAttribute('data-id')); moveStep(s, i, i - 1); }); },
    'step-down': function (el, api) { api.set(function (s) { var i = indexOfStep(s, el.getAttribute('data-id')); moveStep(s, i, i + 1); }); },
    'step-del': function (el, api) {
      var id = el.getAttribute('data-id');
      api.set(function (s) { s.steps = s.steps.filter(function (x) { return x.id !== id; }); });
    },
    reorder: function (move, api) {
      api.set(function (s) { moveStep(s, indexOfStep(s, move.from), indexOfStep(s, move.to)); });
    },
    'add-move': function (el, api) {
      api.set(function (s) {
        if (!s.work.length || !s.people.length) return;
        var a = P.assess(inputOf(s), s.steps);
        var giver = a.after.rows.filter(function (r) { return r.over > 0; }).sort(function (x, y) { return y.over - x.over; })[0];
        var taker = a.after.rows.slice().sort(function (x, y) { return y.spare - x.spare; })[0];
        var item = giver ? giver.items.slice().sort(function (x, y) { return y.hours - x.hours; })[0] : (a.after.unassigned[0] || a.applied.work[0]);
        if (!item || !taker) return;
        var base = String(item.splitOf || item.id);
        s.steps.push({ id: 'm' + (s.seq++), kind: 'move', workId: base, to: taker.id,
          hours: giver ? Math.min(giver.over, Math.max(taker.spare, 1), item.hours) : Math.min(item.hours, Math.max(taker.spare, 1)) });
      });
    },
    'add-descope': function (el, api) {
      api.set(function (s) {
        if (!s.work.length) return;
        var a = P.assess(inputOf(s), s.steps);
        var giver = a.after.rows.filter(function (r) { return r.over > 0; }).sort(function (x, y) { return y.over - x.over; })[0];
        var item = giver ? giver.items.slice().sort(function (x, y) { return y.hours - x.hours; })[0] : (a.after.unassigned[0] || a.applied.work[0]);
        if (!item) return;
        s.steps.push({ id: 'm' + (s.seq++), kind: 'descope', workId: String(item.splitOf || item.id),
          hours: giver ? Math.min(giver.over, item.hours) : Math.min(item.hours, 4) });
      });
    },
    'add-hire': function (el, api) {
      api.set(function (s) {
        var a = P.assess(inputOf(s), s.steps);
        var role = (a.residual.work[0] && a.residual.work[0].role) || (a.residual.people[0] && a.residual.people[0].role) || '';
        s.steps.push({ id: 'm' + (s.seq++), kind: 'hire', role: role, capacity: P.weekHours(s.org).hours, costRate: 0 });
      });
      api.toast('Hire added — now add a "Move work" step to give them something.');
    },
    regen: function (el, api) {
      api.set(function (s) {
        s.steps = P.proposePlan(inputOf(s), s.planOpts);
        s.refineLog.push({ text: 'Regenerate plan', summary: 'Rebuilt from the current team and work (' + s.steps.length + ' steps). Manual edits were replaced.', ok: true });
      });
    },
    refine: function (el, api) {
      var box = document.getElementById('refine-input');
      var text = box ? box.value.trim() : '';
      if (!text) return;
      api.set(function (s) {
        var res = P.refine(text, inputOf(s), s.steps, s.planOpts);
        // Only the lock flags come back: the engine saw labelled names, the saved rows keep what was typed.
        var locked = {};
        res.input.work.forEach(function (w) { if (w.locked) locked[w.id] = true; });
        s.work.forEach(function (w) { if (locked[w.id]) w.locked = true; else delete w.locked; });
        s.steps = res.steps; s.planOpts = res.opts;
        s.refineLog.push({ text: text, summary: res.summary, ok: res.understood });
      });
      var again = document.getElementById('refine-input');
      if (again) again.focus();
    },
    'refine-eg': function (el) {
      var box = document.getElementById('refine-input');
      if (box) { box.value = el.textContent; box.focus(); }
    },
    'goto-plan': function (el, api) { api.go(3); },

    /* land */
    'show-setup': function (el, api) {
      var setup = P.buildSetupSteps(inputOf(api.state), api.state.steps);
      api.modal('<h3>Set it up by hand</h3><p>Your plan as the configuration that makes it real. The rebalanced owners are already applied.</p>' +
        '<ol class="setup">' + setup.map(function (st) {
          return '<li><b>' + esc(st.title) + '</b>' + esc(st.detail) + '<em>' + esc(st.featureName) + ' · ' + esc(st.tier) + '</em></li>';
        }).join('') + '</ol>');
    },
    'show-payload': function (el, api) {
      var payload = JSON.stringify(P.buildZohoPayload(inputOf(api.state), api.state.steps), null, 2);
      api.modal('<h3>The API payload</h3>' +
        '<p>Your plan as Zoho Projects API data. <b>Nothing is sent from this page</b> — it is the specification a developer or the skill follows. <code>{{PORTAL_ID}}</code> is filled in by whoever runs it.</p>' +
        '<div class="btn-row" style="margin-top:0"><button class="btn small" data-act="copy-text" data-text="' + esc(payload) + '">Copy</button></div>' +
        '<div class="payload-preview">' + esc(payload) + '</div>');
    },
    'report-pdf': function (el, api) { if (api.state.lead) Land.openReport(reportHtml(api.state)); },
    'export-md': function (el, api) {
      if (!api.state.lead) return;
      api.download('capacity-plan-' + slug(api.state) + '.md', P.renderReport(inputOf(api.state), api.state.steps), 'text/markdown;charset=utf-8;');
    },
    'export-csv': function (el, api) {
      var s = api.state, inp = inputOf(s), a = P.assess(inp, s.steps);
      if (!s.lead) return;
      var rows = [['Section', 'Item', 'Detail', 'Hours per week']];
      s.steps.forEach(function (st, i) { rows.push(['Plan', 'Step ' + (i + 1), P.describeStep(st, inp), st.kind === 'hire' ? st.capacity : st.hours]); });
      a.after.rows.forEach(function (r) {
        var was = a.before.rows.filter(function (x) { return x.id === r.id; })[0];
        rows.push(['Team load', r.name, (r.role || '') + ' | now ' + (was ? was.allocated : 0) + 'h | capacity ' + r.capacity + 'h', r.allocated]);
      });
      api.download('capacity-plan-' + slug(s) + '.csv', api.csv(rows), 'text/csv;charset=utf-8;');
    },

    how: function (el, api) {
      api.modal('<h3>How this works</h3>' +
        '<p>No AI model runs on this page. The same inputs always produce the same plan.</p>' +
        '<div class="payload-preview">You\n  │  numbers you type in  (reported, not measured)\n  ▼\n' +
        'Planner engine          deterministic, covered by tests\n  ├─ load per person vs capacity\n  ├─ rebalancing plan    (you can edit every step)\n  ├─ validation          rules with a traceable source\n  └─ Zoho Projects setup (payload + sequence)\n  ▼\n' +
        'Two ways to land it\n  ├─ You        follow the setup sequence in Zoho Projects\n  └─ Your agent PM Skills plugin + your Zoho connection,\n                reads real data first, confirms each write</div>' +
        '<p style="margin-top:14px">The same shell runs every PM Skills tool; only the steps change per skill.</p>');
    }
  };

  // The route, the install and connect pop-ups, the copy buttons and the email gate are shared by every tool.
  var landActions = Land.actions({
    prompt: function (s) { return P.buildAgentPrompt(inputOf(s), s.steps); },
    skillPage: '../skills/cost-capacity-optimization.html',
    zips: [{ href: '../downloads/cost-capacity-optimization.zip', label: 'cost-capacity-optimization.zip' },
      { href: '../downloads/zoho-projects-api.zip', label: 'zoho-projects-api.zip' }]
  });
  Object.keys(landActions).forEach(function (k) { actions[k] = landActions[k]; });

  /* ---------- mount ---------- */

  window.PMWizard.mount({
    id: 'cost-capacity',
    version: 3,
    brand: { mark: 'C&C', title: 'Capacity & Cost Planner', sub: 'PM Skills · cost-capacity-optimization' },
    header: [{ label: 'How it works', act: 'how' }],
    hint: function () { return 'Deterministic engine · your plan is saved in this browser'; },
    initialState: blank,
    actions: actions,
    onDone: function (api) {
      api.modal('<h3>Saved</h3><p>Your plan stays in this browser until you press Reset. Come back any time to adjust it or take it into Zoho Projects.</p>');
    },
    steps: [
      { id: 'problem', title: 'Problem', render: renderScenario, canAdvance: function (s) { return !!s.scenario; } },
      { id: 'context', title: 'Context', render: renderContext, canAdvance: contextDone },
      { id: 'team', title: 'Team & work', render: renderTeam,
        canAdvance: function (s) { return s.people.length > 0 && s.work.some(function (w) { return w.hours > 0; }); } },
      { id: 'plan', title: 'Plan', render: renderPlan,
        onEnter: function (s) {
          if (!s.planStale) return;
          var had = s.steps.length > 0;
          s.steps = P.proposePlan(inputOf(s), s.planOpts);
          s.planStale = false;
          if (had) s.refineLog.push({ text: 'Team or context changed', summary: 'Plan rebuilt from the new numbers (' + s.steps.length + ' steps).', ok: true });
        } },
      { id: 'validate', title: 'Validate', render: renderValidate },
      { id: 'land', title: 'Land', render: renderLand }
    ]
  }, document.getElementById('root'));
})();
