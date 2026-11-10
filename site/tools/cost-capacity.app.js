/* ============================================================================
 * Capacity & Cost Planner — the cost-capacity-optimization skill's guided tool.
 *
 * This file is only the skill's STEPS. The chrome, navigation, saved session,
 * modal and drag-reorder come from ../wizard/wizard.js, and every number comes
 * from the tested engine in ../engine.bundle.js (PMEngine.planner). A new skill
 * writes a file like this one and reuses the other two unchanged.
 * ========================================================================== */
(function () {
  'use strict';

  var P = window.PMEngine.planner;
  var C = window.PMEngine.knowledge.catalog;
  var B = window.PMEngine.knowledge.benchmarks;
  var esc = window.PMWizard.esc;

  var JURISDICTIONS = {
    eu: 'European Union', france: 'France', germany: 'Germany', uk: 'United Kingdom', india: 'India',
    uae: 'United Arab Emirates', saudi: 'Saudi Arabia', california: 'California (US)', japan: 'Japan', brazil: 'Brazil'
  };
  var CURRENCIES = ['$', '€', '£', '₹', '¥', 'A$', 'C$', 'AED ', 'SAR ', 'SGD ', 'ZAR '];
  var ZOHO_URL = 'https://www.zoho.com/projects/';

  /* ---------- state ---------- */

  function blank() {
    return {
      step: 0, scenario: null, touched: false, seq: 100,
      org: { name: '', industry: '', billingModel: '', weekPattern: 'mon_fri', workDays: [1, 2, 3, 4, 5],
        hoursPerDay: 8, jurisdiction: '', currency: '$', horizonWeeks: 12 },
      people: [], work: [], budget: { amount: 0, spent: 0 },
      steps: [], planOpts: {}, planStale: true, refineLog: []
    };
  }
  function inputOf(s) { return { org: s.org, people: s.people, work: s.work, budget: s.budget }; }
  function hrs(n) { return (Math.round(n * 10) / 10) + 'h'; }
  function money(s, n) { return (s.org.currency || '') + Math.round(n).toLocaleString('en-US'); }
  function dirty(s) { s.planStale = true; s.touched = true; }
  function opt(v, label, cur) {
    return '<option value="' + esc(v) + '"' + (String(cur == null ? '' : cur) === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>';
  }
  function numAttr(v) { return v === 0 || v ? esc(v) : ''; }

  /* ---------- 1. Problem ---------- */

  function renderScenario(el, api) {
    var s = api.state;
    el.innerHTML =
      '<h2 class="step-title">What are you trying to fix?</h2>' +
      '<p class="step-sub">Pick the problem closest to yours. Each one loads a realistic team so you can see a plan straight away — then overwrite it with your own people and numbers in the next steps.</p>' +
      '<div class="templates">' + C.SCENARIOS.map(function (sc) {
        return '<div class="tpl-card ' + (s.scenario === sc.key ? 'selected' : '') + '" data-act="scenario" data-k="' + sc.key + '">' +
          '<h3>' + esc(sc.title) + '</h3><p>' + esc(sc.tagline) + '</p><div class="tpl-meta">' +
          sc.chips.map(function (c) { return '<span class="chip accent">' + esc(c) + '</span>'; }).join('') +
          '<span class="chip">' + sc.people.length + ' people</span><span class="chip">' + sc.work.length + ' work items</span>' +
          '</div></div>';
      }).join('') + '</div>' +
      '<p class="under-link">' + (s.scenario === 'blank' ? '<b>Starting with an empty team.</b> ' : '') +
      '<a data-act="scenario" data-k="blank">Or start with an empty team and enter everything yourself →</a></p>';
  }

  /* ---------- 2. Context ---------- */

  function renderContext(el, api) {
    var s = api.state, o = s.org;
    var groups = [];
    C.INDUSTRIES.forEach(function (i) { if (groups.indexOf(i.group) === -1) groups.push(i.group); });
    var ind = C.INDUSTRIES.filter(function (i) { return i.key === o.industry; })[0];
    var band = ind && ind.band && B.UTILISATION[ind.band];
    var indNote = !ind ? 'Decides whether a billable ratio means anything for you, and whether a published benchmark exists.'
      : ind.billable === false ? 'No external billing here, so billable ratio is left out. Capacity and cost are what get measured.'
      : band && band.provenance === 'sourced' ? 'A published benchmark exists for this sector: ' + band.source.name + '.'
      : 'No published utilisation benchmark exists for this sector. You are compared with your own numbers, never a made-up target.';
    var bm = B.BILLING_MODELS[o.billingModel];
    var billNote = bm ? 'What matters under ' + bm.label + ': ' + bm.keyMetric + '. ' + bm.high
      : 'Internal work: capacity and delivery are what count, not billable hours.';
    var pattern = C.WEEK_PATTERNS.filter(function (p) { return p.key === o.weekPattern; })[0] || C.WEEK_PATTERNS[0];
    var cal = P.weekHours(o);

    var days = '';
    if (o.weekPattern === 'custom') {
      days = '<div class="checkbox-grid">' + C.DAY_NAMES.map(function (d, i) {
        var on = o.workDays.indexOf(i) !== -1;
        return '<label class="cb ' + (on ? 'on' : '') + '"><input type="checkbox" data-change="org-day" data-d="' + i + '"' +
          (on ? ' checked' : '') + '> ' + d.slice(0, 3) + '</label>';
      }).join('') + '</div>';
    }

    el.innerHTML =
      '<h2 class="step-title">Your context</h2>' +
      '<p class="step-sub">These decide how the numbers are read. The same hours mean something different under a fixed fee than on time &amp; materials, and a "weekend" is not Saturday–Sunday everywhere.</p>' +
      '<div class="form-grid">' +
        '<div class="field"><label>Team or organisation</label><input type="text" value="' + esc(o.name) + '" placeholder="e.g. Delivery team, Apex Studio" data-input="org-text" data-k="name"></div>' +
        '<div class="field"><label>Industry</label><select data-change="org" data-k="industry">' + opt('', 'Choose…', o.industry) +
          groups.map(function (g) {
            return '<optgroup label="' + esc(g) + '">' + C.INDUSTRIES.filter(function (i) { return i.group === g; })
              .map(function (i) { return opt(i.key, i.label, o.industry); }).join('') + '</optgroup>';
          }).join('') + '</select><div class="note">' + esc(indNote) + '</div></div>' +
        '<div class="field"><label>How the work is paid for</label><select data-change="org" data-k="billingModel">' +
          opt('', 'Not client-billed (internal work)', o.billingModel) +
          Object.keys(B.BILLING_MODELS).map(function (k) {
            var l = B.BILLING_MODELS[k].label; return opt(k, l.charAt(0).toUpperCase() + l.slice(1), o.billingModel);
          }).join('') + '</select><div class="note">' + esc(billNote) + '</div></div>' +
        '<div class="field"><label>Working week</label><select data-change="org" data-k="weekPattern">' +
          C.WEEK_PATTERNS.map(function (p) { return opt(p.key, p.label, o.weekPattern); }).join('') + '</select>' +
          '<div class="note">' + esc(pattern.where) + '</div>' + days + '</div>' +
        '<div class="field"><label>Hours per working day</label><input type="number" min="1" max="24" step="0.5" value="' + numAttr(o.hoursPerDay) + '" data-change="org" data-k="hoursPerDay"></div>' +
        '<div class="field"><label>Planning horizon (weeks)</label><input type="number" min="1" max="104" value="' + numAttr(o.horizonWeeks) + '" data-change="org" data-k="horizonWeeks">' +
          '<div class="note">How long this allocation is expected to hold. Sustained overload only counts as a finding over three weeks or more.</div></div>' +
        '<div class="field"><label>Currency</label><select data-change="org" data-k="currency">' +
          CURRENCIES.map(function (c) { return opt(c, c.trim(), o.currency); }).join('') + '</select></div>' +
        '<div class="field"><label>Jurisdiction (optional)</label><select data-change="org" data-k="jurisdiction">' + opt('', 'Not specified', o.jurisdiction) +
          Object.keys(JURISDICTIONS).map(function (k) { return opt(k, JURISDICTIONS[k], o.jurisdiction); }).join('') +
          '</select><div class="note">Only used to name the working-time rules worth checking. This tool does not assess compliance.</div></div>' +
        '<div class="field"><label>Budget for this work (optional)</label><input type="number" min="0" step="1000" value="' + (s.budget.amount ? esc(s.budget.amount) : '') + '" placeholder="Leave empty to skip the forecast" data-change="budget" data-k="amount"></div>' +
        '<div class="field"><label>Spent so far</label><input type="number" min="0" step="1000" value="' + (s.budget.spent ? esc(s.budget.spent) : '') + '" placeholder="0" data-change="budget" data-k="spent"></div>' +
      '</div>' +
      '<div class="summary-line">Working week: <b>' + cal.days.map(function (d) { return C.DAY_NAMES[d].slice(0, 3); }).join(' · ') +
        '</b> = <b>' + hrs(cal.hours) + '</b> &nbsp;·&nbsp; Planning <b>' + esc(o.horizonWeeks) + ' weeks</b> ahead' +
        (s.budget.amount > 0 ? ' &nbsp;·&nbsp; Budget <b>' + money(s, s.budget.amount) + '</b>' : '') + '</div>';
  }

  /* ---------- 3. Team & work ---------- */

  function teamTotals(s) {
    var load = P.computeLoad(s.people, s.work), t = load.totals, cal = P.weekHours(s.org);
    var over = load.rows.filter(function (r) { return r.over > 0; });
    var pe = document.getElementById('tw-people'), we = document.getElementById('tw-work');
    if (pe) pe.innerHTML = '<b>' + t.people + '</b> people · <b>' + hrs(t.capacity) + '</b> weekly capacity · working week is ' + hrs(cal.hours);
    if (we) we.innerHTML = '<b>' + hrs(t.allocated) + '</b> allocated' +
      (over.length ? ' · <span class="bad">over capacity: ' + over.map(function (r) { return esc(r.name) + ' +' + hrs(r.over); }).join(', ') + '</span>' : '') +
      (t.unassignedHours > 0 ? ' · <span class="bad">' + hrs(t.unassignedHours) + ' unowned</span>' : '');
  }

  function renderTeam(el, api) {
    var s = api.state;
    var roles = [];
    s.people.forEach(function (p) { if (p.role && roles.indexOf(p.role) === -1) roles.push(p.role); });

    var people = s.people.map(function (p) {
      var c = function (k, type, cls) {
        return '<td class="cell ' + (cls || '') + '"><input type="' + type + '"' + (type === 'number' ? ' min="0" step="any"' : '') +
          (k === 'role' ? ' list="roles"' : '') + ' value="' + numAttr(p[k]) + '" data-change="person" data-id="' + p.id + '" data-k="' + k + '"' +
          (k === 'name' ? ' placeholder="Name"' : k === 'role' ? ' placeholder="Role"' : '') + '></td>';
      };
      return '<tr>' + c('name', 'text') + c('role', 'text') + c('capacity', 'number', 'num') + c('costRate', 'number', 'num') +
        c('billRate', 'number', 'num') + '<td class="ops"><button class="x-btn" title="Remove" data-act="del-person" data-id="' + p.id + '">×</button></td></tr>';
    }).join('');

    var work = s.work.map(function (w) {
      var owner = s.people.filter(function (p) { return p.id === w.owner; })[0];
      return '<tr>' +
        '<td class="cell"><input type="text" value="' + esc(w.title) + '" placeholder="Work item" data-change="work" data-id="' + w.id + '" data-k="title"></td>' +
        '<td class="cell"><input type="text" value="' + esc(w.project || '') + '" placeholder="Project / client" data-change="work" data-id="' + w.id + '" data-k="project"></td>' +
        '<td class="cell"><select data-change="work" data-id="' + w.id + '" data-k="owner">' + opt('', 'Unowned', w.owner || '') +
          s.people.map(function (p) { return opt(p.id, p.name || 'Unnamed', w.owner); }).join('') + '</select></td>' +
        '<td class="cell"><input type="text" list="roles" value="' + esc(w.role || '') + '" placeholder="' + esc(owner ? owner.role || 'Any' : 'Role needed') + '" data-change="work" data-id="' + w.id + '" data-k="role"></td>' +
        '<td class="cell num"><input type="number" min="0" step="any" value="' + numAttr(w.hours) + '" data-change="work" data-id="' + w.id + '" data-k="hours"></td>' +
        '<td class="chk"><input type="checkbox"' + (w.billable ? ' checked' : '') + ' data-change="work" data-id="' + w.id + '" data-k="billable"></td>' +
        '<td class="ops"><button class="x-btn" title="Remove" data-act="del-work" data-id="' + w.id + '">×</button></td></tr>';
    }).join('');

    el.innerHTML =
      '<h2 class="step-title">Team &amp; work</h2>' +
      '<p class="step-sub">Who is on the team, and what each person is carrying in a typical week. Rough numbers are fine — the plan is only as exact as these are, and it says so.</p>' +
      '<h3 class="sec" style="margin-top:0">People</h3>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>Name</th><th>Role</th><th>Capacity h/week</th><th>Cost / hour</th><th>Bill / hour</th><th></th></tr></thead>' +
        '<tbody id="tb-people">' + (people || '<tr><td colspan="6" class="plan-empty">No people yet.</td></tr>') + '</tbody></table></div>' +
      '<div class="table-foot"><button class="btn small" data-act="add-person">+ Add person</button><div class="totals" id="tw-people"></div></div>' +
      '<h3 class="sec">Work — hours per week</h3>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>Work item</th><th>Project / client</th><th>Owner</th><th>Role needed</th><th>Hours/week</th><th>Billable</th><th></th></tr></thead>' +
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

  function stepEditor(st, s, people) {
    var f = function (k) { return ' data-change="step-field" data-id="' + esc(st.id) + '" data-k="' + k + '"'; };
    var items = '<select' + f('workId') + '>' + s.work.map(function (w) {
      return opt(w.id, w.title + (w.project ? ' — ' + w.project : ''), st.workId);
    }).join('') + '</select>';
    if (st.kind === 'hire') {
      return '<input type="text" value="' + esc(st.role || '') + '" placeholder="Role"' + f('role') + '>' +
        '<input type="number" min="1" step="any" value="' + numAttr(st.capacity) + '" title="Hours per week"' + f('capacity') + '><span class="arrow">h/week at</span>' +
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
      var z = C.ZOHO_FEATURES[f.feature];
      return '<div class="find"><span class="pill g-' + f.grade + '">' + f.grade + '</span><b>' + esc(f.headline) + '</b><p>' + esc(f.detail) + '</p>' +
        (z ? '<div class="zbind"><em>In Zoho Projects — ' + esc(z.name) + '.</em> ' + esc(z.does) + ' <span>(' + esc(z.tier) + ')</span></div>' : '') + '</div>';
    }).join('');

    var issues = {};
    a.applied.issues.forEach(function (i) { issues[i.stepId] = i.msg; });
    var rows = s.steps.map(function (st, i) {
      return '<div class="plan-row' + (issues[st.id] ? ' skipped' : '') + '" draggable="true" data-drag-id="' + esc(st.id) + '">' +
        '<span class="grip" title="Drag to reorder">⋮⋮</span><span class="n">' + (i + 1) + '</span>' +
        '<div><div class="plan-text">' + esc(P.describeStep(st, inp)) + '</div>' +
        '<div class="plan-edit">' + stepEditor(st, s, a.applied.people) + '</div>' +
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

    var log = s.refineLog.length
      ? s.refineLog.map(function (r) { return '<div class="entry' + (r.ok ? '' : ' miss') + '"><b>' + esc(r.text) + '</b> — ' + esc(r.summary) + '</div>'; }).join('')
      : 'This box takes fixed commands — it is a parser, not a chatbot. Try: ' + P.REFINE_EXAMPLES.map(function (e) { return '“' + esc(e) + '”'; }).join(', ') + '.';

    el.innerHTML =
      '<h2 class="step-title">Your plan</h2>' +
      '<p class="step-sub">Built from the numbers you entered. Edit any step, drag to reorder, remove what you disagree with, or add your own — everything below recalculates as you go.</p>' +
      '<div class="verdict">' + esc(a.headline) + '</div>' +
      '<div class="tree-toolbar"><div class="tree-stats">' +
        '<span><b>' + t1.people + '</b> people</span>' +
        '<span><b>' + hrs(t1.capacity) + '</b> capacity</span>' +
        '<span><b>' + hrs(t1.allocated) + '</b> allocated</span>' +
        '<span class="' + (t1.overHours > 0 ? 'bad' : 'good') + '">over capacity <b>' + hrs(t0.overHours) + ' → ' + hrs(t1.overHours) + '</b></span>' +
        (t0.unassignedHours > 0 ? '<span class="' + (t1.unassignedHours > 0 ? 'bad' : 'good') + '">unowned <b>' + hrs(t0.unassignedHours) + ' → ' + hrs(t1.unassignedHours) + '</b></span>' : '') +
        (t1.weeklyCost > 0 ? '<span><b>' + money(s, t1.weeklyCost) + '</b> a week</span>' : '') +
        (a.budget ? '<span class="' + (a.budget.after.over > 0 ? 'bad' : 'good') + '">forecast <b>' + money(s, a.budget.after.forecast) + '</b> of ' + money(s, a.budget.after.amount) + '</span>' : '') +
      '</div><div><button class="btn small ghost" data-act="regen">Regenerate plan</button></div></div>' +

      '<h3 class="sec">Team load — now, and after the plan</h3><div class="load">' + bars + '</div>' +
      '<div class="legend">The black marker is each person\'s weekly capacity. Red means allocated above it.</div>' +

      '<h3 class="sec">The plan</h3>' +
      '<div class="plan" data-drop="reorder">' + (rows || '<div class="plan-empty">No steps. Add one below, or regenerate.</div>') + '</div>' +
      '<div class="plan-add"><button class="btn small" data-act="add-move">+ Move work</button>' +
        '<button class="btn small" data-act="add-descope">+ Descope work</button>' +
        '<button class="btn small" data-act="add-hire">+ Add a hire</button></div>' +
      residual +
      '<div class="refine-box"><input type="text" id="refine-input" data-enter="refine" placeholder="e.g. move API integration to Arjun · don\'t touch Tara · same role only · hire a Developer">' +
        '<button class="btn primary" data-act="refine">Refine</button></div>' +
      '<div class="refine-log">' + log + '</div>' +

      '<h3 class="sec">Where things stand today</h3>' + (findings || '<div class="plan-empty">Nothing to report.</div>');
  }

  /* ---------- 5. Validate ---------- */

  function renderValidate(el, api) {
    var s = api.state, results = P.validate(inputOf(s), s.steps);
    var n = { pass: 0, warn: 0, fail: 0 };
    results.forEach(function (r) { n[r.state]++; });
    el.innerHTML =
      '<h2 class="step-title">Validation</h2>' +
      '<p class="step-sub">The plan checked against rules with a traceable basis. <b>' + n.pass + ' pass · ' + n.warn + ' warn · ' + n.fail + ' fail.</b> ' +
        (n.fail ? 'A failure is information, not a lock — <a data-act="goto-plan" style="cursor:pointer">go back to the plan</a> to fix it, or carry on knowing it is there.' : 'Nothing is blocking this plan.') + '</p>' +
      '<div class="val-grid">' + results.map(function (r) {
        return '<div class="val-card ' + r.state + '"><span class="status">' + r.state.toUpperCase() + '</span><h4>' + esc(r.rule) + '</h4><p>' + esc(r.detail) + '</p>' +
          (r.violations.length ? '<ul>' + r.violations.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ul>' : '') +
          '<div class="basis">' + esc(r.basis) + '</div></div>';
      }).join('') + '</div>';
  }

  /* ---------- 6. Land ---------- */

  function renderLand(el, api) {
    var s = api.state, setup = P.buildSetupSteps(inputOf(s), s.steps);
    el.innerHTML =
      '<h2 class="step-title">Take it into Zoho Projects</h2>' +
      '<p class="step-sub">Everything so far is an estimate from numbers you typed. Zoho Projects is where it becomes measured. Your plan is saved in this browser, so it will still be here when you come back.</p>' +
      '<div class="land-grid">' +
        '<div class="land-card"><h3>Set it up in Zoho Projects</h3>' +
          '<p>This is your plan translated into the configuration that makes it real — the rebalanced owners are already applied.</p>' +
          '<ol class="setup">' + setup.map(function (st) {
            return '<li><b>' + esc(st.title) + '</b>' + esc(st.detail) + '<em>' + esc(st.featureName) + ' · ' + esc(st.tier) + '</em></li>';
          }).join('') + '</ol>' +
          '<div class="btn-row"><button class="btn primary" data-act="try-zoho">Try on Zoho Projects</button>' +
          '<button class="btn" data-act="show-payload">See the API payload</button></div></div>' +
        '<div class="land-col">' +
          '<div class="land-card"><h3>Or hand it to your AI agent</h3>' +
            '<p>If you use Claude, ChatGPT or Gemini, the PM Skills plugin can carry this plan out through your own Zoho connection. It reads the real numbers first, tells you where they differ from what you entered, and asks before every change.</p>' +
            '<div class="btn-row"><button class="btn" data-act="copy-prompt">Copy the hand-off prompt</button>' +
            '<a class="btn" href="../index.html#install">Install the skill</a></div></div>' +
          '<div class="land-card"><h3>Export</h3><p>Take the plan with you.</p>' +
            '<div class="btn-row"><button class="btn" data-act="export-md">Report (Markdown)</button>' +
            '<button class="btn" data-act="export-csv">Plan (CSV)</button></div></div>' +
        '</div></div>';
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
        if (key === 'blank') { s.people = []; s.work = []; s.budget = { amount: 0, spent: 0 }; }
        else {
          var sc = JSON.parse(JSON.stringify(C.SCENARIOS.filter(function (x) { return x.key === key; })[0]));
          s.people = sc.people; s.work = sc.work; s.budget = sc.budget;
          s.org.industry = sc.org.industry; s.org.billingModel = sc.org.billingModel;
        }
        // Always reset: a horizon left over from the previous scenario would silently
        // change the forecast and the sustained-overload check.
        s.org.horizonWeeks = (key !== 'blank' && sc.horizonWeeks) || 12;
        s.scenario = key; s.steps = []; s.planOpts = {}; s.refineLog = []; s.planStale = true; s.touched = false;
      });
    },

    'org-text': function (el, api) { api.patch(function (s) { s.org[el.getAttribute('data-k')] = el.value; }); },
    org: function (el, api) {
      var k = el.getAttribute('data-k');
      api.set(function (s) {
        if (k === 'hoursPerDay' || k === 'horizonWeeks') s.org[k] = Math.max(1, Number(el.value) || 1);
        else if (k === 'weekPattern') {
          var prev = P.weekHours(s.org).days;
          s.org.weekPattern = el.value;
          if (el.value === 'custom') s.org.workDays = prev.slice();
        } else s.org[k] = el.value;
        s.planStale = true;
      });
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
    budget: function (el, api) { api.set(function (s) { s.budget[el.getAttribute('data-k')] = Math.max(0, Number(el.value) || 0); }); },

    person: function (el, api) {
      var id = el.getAttribute('data-id'), k = el.getAttribute('data-k');
      api.patch(function (s) {
        var p = s.people.filter(function (x) { return x.id === id; })[0];
        if (!p) return;
        p[k] = (k === 'name' || k === 'role') ? el.value.trim() : Math.max(0, Number(el.value) || 0);
        dirty(s);
      });
      if (k === 'name') {
        [].forEach.call(document.querySelectorAll('#tb-work option[value="' + id + '"]'), function (o) { o.textContent = el.value.trim() || 'Unnamed'; });
      }
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
      teamTotals(api.state);
    },
    'add-person': function (el, api) {
      api.set(function (s) {
        s.people.push({ id: 'p' + (s.seq++), name: '', role: '', capacity: P.weekHours(s.org).hours, costRate: 0, billRate: 0 });
        dirty(s);
      });
      var last = document.querySelector('#tb-people tr:last-child input');
      if (last) last.focus();
    },
    'add-work': function (el, api) {
      api.set(function (s) {
        var ind = C.INDUSTRIES.filter(function (i) { return i.key === s.org.industry; })[0];
        s.work.push({ id: 'w' + (s.seq++), title: '', project: '', owner: null, role: '', hours: 8, billable: !!(ind && ind.billable === true) });
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
        s.work = res.input.work; s.steps = res.steps; s.planOpts = res.opts;
        s.refineLog.push({ text: text, summary: res.summary, ok: res.understood });
      });
      var again = document.getElementById('refine-input');
      if (again) again.focus();
    },
    'goto-plan': function (el, api) { api.go(3); },

    'try-zoho': function (el, api) {
      api.patch(function (s) { s.triedZoho = new Date().toISOString(); });
      window.open(ZOHO_URL, '_blank', 'noopener');
      var setup = P.buildSetupSteps(inputOf(api.state), api.state.steps);
      api.modal('<h3>Your plan is saved here</h3>' +
        '<p>Zoho Projects has opened in a new tab. Once you have a portal, come back to this page — the plan and the setup sequence will be exactly as you left them, in this browser.</p>' +
        '<ol class="setup">' + setup.map(function (st) { return '<li><b>' + esc(st.title) + '</b><em>' + esc(st.featureName) + ' · ' + esc(st.tier) + '</em></li>'; }).join('') + '</ol>' +
        '<p>Prefer not to click through it? Copy the hand-off prompt and let the PM Skills plugin do the setup through your own Zoho connection, asking before each change.</p>');
    },
    'show-payload': function (el, api) {
      var payload = P.buildZohoPayload(inputOf(api.state), api.state.steps);
      api.modal('<h3>What gets set up</h3>' +
        '<p>This is the plan as Zoho Projects API data. <b>Nothing is sent from this page</b> — it has no access to any portal. It is the specification the skill (or a person) follows; <code>{{PORTAL_ID}}</code> is filled in by whoever runs it.</p>' +
        '<div class="payload-preview">' + esc(JSON.stringify(payload, null, 2)) + '</div>');
    },
    'copy-prompt': function (el, api) {
      api.copy(P.buildAgentPrompt(inputOf(api.state), api.state.steps)).then(function () { api.toast('Hand-off prompt copied'); });
    },
    'export-md': function (el, api) {
      api.download('capacity-plan-' + slug(api.state) + '.md', P.renderReport(inputOf(api.state), api.state.steps), 'text/markdown;charset=utf-8;');
    },
    'export-csv': function (el, api) {
      var s = api.state, inp = inputOf(s), a = P.assess(inp, s.steps);
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
        '<p style="margin-top:12px">The same wizard shell runs every PM Skills tool; only the steps change per skill. A Zia agent mode for the refine box is planned.</p>');
    }
  };

  /* ---------- mount ---------- */

  window.PMWizard.mount({
    id: 'cost-capacity',
    version: 2,
    brand: { mark: 'C&C', title: 'Capacity & Cost Planner', sub: 'PM Skills · cost-capacity-optimization' },
    header: [{ label: 'How it works', act: 'how' }],
    hint: function () { return 'Deterministic engine · your plan is saved in this browser'; },
    initialState: blank,
    actions: actions,
    onDone: function (api) {
      api.modal('<h3>Saved</h3><p>Your plan stays in this browser until you press Reset. Come back any time to adjust it, export it, or take it into Zoho Projects.</p>');
    },
    steps: [
      { id: 'problem', title: 'Problem', render: renderScenario, canAdvance: function (s) { return !!s.scenario; } },
      { id: 'context', title: 'Context', render: renderContext, canAdvance: function (s) { return !!s.org.industry; } },
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
