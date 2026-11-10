'use strict';
/* ============================================================================
 * Capacity & cost planner — the engine behind the wizard.
 * ----------------------------------------------------------------------------
 * Works on REPORTED data: the people, rates and weekly hours a user types in.
 * From that it computes who is over capacity, proposes a concrete rebalancing
 * plan, re-computes the picture as the user edits that plan, validates it
 * against the sourced rules, and emits the Zoho Projects setup that would make
 * the same picture measurable for real.
 *
 * Deliberate choices:
 *   - "Over capacity" means allocated > capacity. That is arithmetic, not a
 *     benchmark. There is no "under-utilised" percentage band here, because no
 *     such band has provenance; spare HOURS are reported instead.
 *   - Every figure is graded `reported` (the user typed it) or `derived`
 *     (arithmetic over what they typed). Nothing is presented as measured.
 *   - The plan never removes a person and never changes a rate.
 * ========================================================================== */

const C = require('../knowledge/catalog');
const B = require('../knowledge/benchmarks');
const R = require('./recommend');

const SUSTAINED_HOURS = 50;   // Thomas & Raynar (1997): losses at 50-60h weeks
const SUSTAINED_WEEKS = 3;

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r1 = n => Math.round(n * 10) / 10;
const clone = x => JSON.parse(JSON.stringify(x));
const fmtH = n => `${r1(n)}h`;

/* The one place a figure becomes text, so a plan cannot show two currencies.
 * `org.currency` is an ISO code from the catalogue; anything else is used as a
 * literal prefix. */
function currencySymbol(org = {}) {
  const cur = org.currency || '';
  const known = C.CURRENCIES.find(c => c.code === cur);
  return known ? known.symbol : cur;
}
function money(input, n) {
  return `${currencySymbol(input.org)}${Math.round(num(n)).toLocaleString('en-US')}`;
}

const isInternal = input => !!input.org && input.org.billingModel === 'internal';

/* --- labels ----------------------------------------------------------------
 * Names are optional. A blank name becomes a generic reference built from the
 * role ("Consultant #3"), a blank project becomes "Project #2". With
 * org.genericLabels on, EVERY person and project is referred to that way, so a
 * plan can be built and shared without a single real name in it. */
function withLabels(input) {
  const generic = !!(input.org && input.org.genericLabels);
  const perRole = new Map();
  const people = input.people.map(p => {
    const role = (p.role || '').trim();
    const n = (perRole.get(role.toLowerCase()) || 0) + 1;
    perRole.set(role.toLowerCase(), n);
    const typed = (p.name || '').trim();
    return { ...p, name: generic || !typed ? `${role || 'Person'} #${n}` : typed };
  });

  const projects = new Map();
  for (const w of input.work) {
    const key = (w.project || '').trim();
    if (!projects.has(key)) projects.set(key, `Project #${projects.size + 1}`);
  }
  const work = input.work.map((w, i) => {
    const key = (w.project || '').trim();
    return { ...w, title: (w.title || '').trim() || `Work item #${i + 1}`,
      project: generic || !key ? projects.get(key) : key };
  });
  return { ...input, people, work };
}

function index(people) { return new Map(people.map(p => [p.id, p])); }
function withArticle(word) { return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`; }

/** The role a piece of work needs: stated on the item, else its owner's role. */
function roleNeeded(item, byId) {
  if (item.role) return item.role;
  const owner = byId.get(item.owner);
  return owner ? owner.role : '';
}

/* --- working calendar ------------------------------------------------------ */

function weekHours(org = {}) {
  const pattern = C.WEEK_PATTERNS.find(p => p.key === org.weekPattern);
  const days = (pattern && pattern.days) || org.workDays || [1, 2, 3, 4, 5];
  const perDay = num(org.hoursPerDay) || 8;
  const half = pattern && pattern.halfDay != null ? 0.5 : 0;
  return { days, hours: r1((days.length - half) * perDay), perDay };
}

/* --- load ------------------------------------------------------------------ */

function computeLoad(people, work) {
  const slots = new Map();
  for (const p of people) {
    slots.set(p.id, { id: p.id, name: p.name || 'Unnamed', role: p.role || '', isHire: !!p.isHire,
      capacity: num(p.capacity), costRate: num(p.costRate), allocated: 0, billable: 0, items: [] });
  }
  const unassigned = [];
  for (const w of work) {
    const h = num(w.hours);
    if (h <= 0) continue;
    const s = w.owner != null ? slots.get(w.owner) : null;
    if (!s) { unassigned.push(w); continue; }
    s.allocated += h;
    if (w.billable) s.billable += h;
    s.items.push(w);
  }

  const rows = [...slots.values()].map(s => ({
    ...s,
    allocated: r1(s.allocated),
    spare: r1(Math.max(0, s.capacity - s.allocated)),
    over: r1(Math.max(0, s.allocated - s.capacity)),
    pct: s.capacity > 0 ? s.allocated / s.capacity : null,
  }));

  const sum = f => r1(rows.reduce((a, r) => a + f(r), 0));
  const missingRates = rows.filter(r => r.allocated > 0 && !(r.costRate > 0)).map(r => r.name);

  return {
    rows,
    unassigned,
    totals: {
      people: rows.length,
      capacity: sum(r => r.capacity),
      allocated: sum(r => r.allocated),
      billable: sum(r => r.billable),
      overHours: sum(r => r.over),
      spareHours: sum(r => r.spare),
      unassignedHours: r1(unassigned.reduce((a, w) => a + num(w.hours), 0)),
      weeklyCost: Math.round(rows.reduce((a, r) => a + r.allocated * r.costRate, 0)),
      missingRates,
    },
  };
}

/* --- propose a plan --------------------------------------------------------- */

/**
 * Greedy, deterministic rebalancing.
 *   Phase 1: relieve people who are over capacity (they are already hurting).
 *   Phase 2: place work that has no owner.
 * A whole item moves when one fits the gap closely; otherwise only the hours
 * needed are split off, so the plan disturbs as little as possible.
 *
 * opts.allowCrossRole (default true): relief may cross roles — flagged later.
 * opts.exclude: person ids that neither give nor receive work.
 * Items with `locked: true` never move.
 */
function proposePlan(input, opts = {}) {
  const allowCross = opts.allowCrossRole !== false;
  const exclude = new Set(opts.exclude || []);

  const people = input.people.map(p => ({ id: p.id, role: p.role || '',
    capacity: num(p.capacity), costRate: num(p.costRate), allocated: 0 }));
  const byId = index(people);
  const items = input.work.filter(w => num(w.hours) > 0).map(w => ({
    id: w.id, owner: byId.has(w.owner) ? w.owner : null,
    role: w.role || (byId.get(w.owner) || {}).role || '',
    hours: num(w.hours), locked: !!w.locked,
  }));
  for (const it of items) if (it.owner) byId.get(it.owner).allocated += it.hours;

  const spare = p => p.capacity - p.allocated;
  const steps = [];
  let n = 0;

  function receiver(role, notId) {
    const c = people.filter(p => p.id !== notId && !exclude.has(p.id) && spare(p) >= 0.5 &&
      (allowCross || p.role === role));
    c.sort((a, b) => (b.role === role) - (a.role === role) || spare(b) - spare(a) || a.costRate - b.costRate);
    return c[0] || null;
  }

  // Phase 1 — relieve overload, worst first.
  const over = people.filter(p => p.allocated - p.capacity > 0.01 && !exclude.has(p.id))
    .sort((a, b) => (b.allocated - b.capacity) - (a.allocated - a.capacity));

  for (const p of over) {
    let guard = 0;
    while (p.allocated - p.capacity > 0.01 && guard++ < 25) {
      const need = p.allocated - p.capacity;
      const cands = items.filter(i => i.owner === p.id && !i.locked && i.hours > 0)
        .map(i => ({ i, r: receiver(i.role, p.id) })).filter(c => c.r);
      if (!cands.length) break;

      const cross = c => (c.r.role === c.i.role ? 0 : 1);
      const whole = cands
        .filter(c => c.i.hours >= need - 0.01 && c.i.hours <= spare(c.r) + 0.01 && c.i.hours <= need * 1.5 + 0.01)
        .sort((a, b) => cross(a) - cross(b) || a.i.hours - b.i.hours)[0];

      let pick, h;
      if (whole) { pick = whole; h = whole.i.hours; }
      else {
        pick = cands.sort((a, b) => cross(a) - cross(b) || b.i.hours - a.i.hours)[0];
        h = Math.min(need, spare(pick.r), pick.i.hours);
      }
      h = r1(h);
      if (h < 0.1) break;

      steps.push({ id: `s${++n}`, kind: 'move', workId: pick.i.id, to: pick.r.id, hours: h });
      p.allocated -= h;
      pick.r.allocated += h;
      pick.i.hours = r1(pick.i.hours - h);
    }
  }

  // Phase 2 — place unowned work. New work goes to the right role or stays a gap:
  // quietly handing a build to a designer would hide the staffing problem.
  const unowned = items.filter(i => !i.owner && !i.locked).sort((a, b) => b.hours - a.hours);
  for (const it of unowned) {
    let guard = 0;
    while (it.hours > 0.01 && guard++ < 25) {
      const c = people
        .filter(p => !exclude.has(p.id) && spare(p) >= 0.5 && (!it.role || p.role === it.role))
        .sort((a, b) => spare(b) - spare(a) || a.costRate - b.costRate)[0];
      if (!c) break;
      const h = r1(Math.min(it.hours, spare(c)));
      steps.push({ id: `s${++n}`, kind: 'move', workId: it.id, to: c.id, hours: h });
      c.allocated += h;
      it.hours = r1(it.hours - h);
    }
  }

  return steps;
}

/* --- apply a (possibly hand-edited) plan ----------------------------------- */

/**
 * Applies steps in order and returns the resulting people + work.
 * Steps the user has edited into nonsense are skipped and reported in `issues`
 * rather than throwing — the plan is theirs to rearrange.
 *
 * Step kinds:
 *   move    { workId, to, hours }        reassign or assign (whole or partial)
 *   descope { workId, hours }            take hours out of the plan entirely
 *   hire    { role, capacity, costRate } add a placeholder person
 */
function applyPlan(input, steps = []) {
  const people = clone(input.people);
  const work = clone(input.work);
  const issues = [];

  for (const step of steps) {
    if (step.kind === 'hire') {
      people.push({ id: `hire-${step.id}`, name: `New ${step.role || 'hire'}`, role: step.role || '',
        capacity: num(step.capacity) || 40, costRate: num(step.costRate), billRate: 0, isHire: true });
      continue;
    }

    const item = work.find(w => w.id === step.workId);
    if (!item || num(item.hours) <= 0) { issues.push({ stepId: step.id, msg: 'the work item no longer has hours to move' }); continue; }
    const h = r1(Math.min(num(step.hours), num(item.hours)));
    if (h <= 0) { issues.push({ stepId: step.id, msg: 'hours must be above zero' }); continue; }

    if (step.kind === 'descope') {
      item.hours = r1(num(item.hours) - h);
      continue;
    }

    if (step.kind === 'move') {
      const to = people.find(p => p.id === step.to);
      if (!to) { issues.push({ stepId: step.id, msg: 'the person to receive this work is not on the team' }); continue; }
      if (item.owner === to.id) { issues.push({ stepId: step.id, msg: `${to.name} already owns this work` }); continue; }
      if (h >= num(item.hours) - 0.01) {
        if (!item.role) item.role = roleNeeded(item, index(people));
        item.owner = to.id;
      } else {
        const neededRole = roleNeeded(item, index(people));
        item.hours = r1(num(item.hours) - h);
        work.push({ ...item, id: `${item.id}#${step.id}`, hours: h, owner: to.id, role: neededRole, splitOf: item.id });
      }
    }
  }

  return { people, work: work.filter(w => num(w.hours) > 0), issues };
}

/* --- describe -------------------------------------------------------------- */

function describeStep(step, input) {
  const byId = index(input.people);
  const item = input.work.find(w => w.id === step.workId);
  const title = item ? `"${item.title}"${item.project ? ` (${item.project})` : ''}` : 'a removed work item';
  if (step.kind === 'hire') return `Add ${withArticle(step.role || 'new hire')} at ${fmtH(num(step.capacity) || 40)}/week`;
  if (step.kind === 'descope') return `Descope ${title} by ${fmtH(step.hours)}/week`;
  const to = byId.get(step.to);
  const from = item && byId.get(item.owner);
  const toName = to ? to.name : (String(step.to).startsWith('hire-') ? 'the new hire' : 'someone not on the team');
  return from
    ? `Move ${fmtH(step.hours)}/week of ${title} from ${from.name} to ${toName}`
    : `Assign ${fmtH(step.hours)}/week of ${title} to ${toName}`;
}

/* --- assess ---------------------------------------------------------------- */

function billableNote(input, load) {
  const total = load.totals.allocated;
  if (!total) return null;
  const ind = C.INDUSTRIES.find(i => i.key === input.org.industry);
  if (isInternal(input)) {
    return { id: 'billable', grade: 'reported', feature: 'timesheets',
      headline: 'Billable ratio is left out — this work is not client-billed',
      detail: 'With no client paying by the hour, a billable percentage would be invented. Capacity and delivery predictability are the measures that matter here.' };
  }
  if (ind && ind.billable === false) {
    return { id: 'billable', grade: 'reported', feature: 'timesheets',
      headline: `Billable ratio is not a useful measure for ${ind.label.toLowerCase()}`,
      detail: 'There is no external billing rate, so any percentage would be invented. Capacity and delivery predictability are the measures that matter here.' };
  }
  if (!load.totals.billable && !(ind && ind.billable === true)) return null;
  const ratio = load.totals.billable / total;
  const billing = B.BILLING_MODELS[input.org.billingModel] || null;
  const note = R.billableCommentary({ value: { ratio } }, { industry: ind ? ind.band : undefined }, billing).assessment;
  return { id: 'billable', grade: 'derived', feature: 'timesheets', headline: note.headline, detail: note.detail };
}

function budgetView(input, weeklyCost) {
  // Internal work is planned on capacity; the tool does not ask for a budget there.
  if (isInternal(input)) return null;
  const b = input.budget || {};
  const amount = num(b.amount);
  if (!(amount > 0)) return null;
  const weeks = num(input.org.horizonWeeks) || 0;
  const spent = num(b.spent);
  const forecast = Math.round(spent + weeklyCost * weeks);
  return { amount, spent, weeks, forecast, over: forecast - amount };
}

/**
 * The whole picture: where things stand, what the plan changes, what is left.
 */
function assess(input, steps = [], opts = {}) {
  const before = computeLoad(input.people, input.work);
  const applied = applyPlan(input, steps);
  const after = computeLoad(applied.people, applied.work);
  // Could the team still absorb more than this plan asks of it? Distinguishes
  // "no capacity left" from "the user removed a step" — they need different advice.
  const absorbable = proposePlan({ ...input, people: applied.people, work: applied.work }, opts).length > 0;
  const horizon = num(input.org.horizonWeeks) || 0;
  const findings = [];

  for (const r of before.rows.filter(x => x.over > 0).sort((a, b) => b.over - a.over)) {
    findings.push({ id: `over.${r.id}`, grade: 'reported', feature: 'workload',
      headline: `${r.name} is ${fmtH(r.over)}/week over capacity (${fmtH(r.allocated)} against ${fmtH(r.capacity)})`,
      detail: `Carrying: ${r.items.map(w => `${w.title} (${fmtH(w.hours)})`).join(', ')}.` });
  }

  const sustained = before.rows.filter(r => r.allocated > SUSTAINED_HOURS);
  if (sustained.length && horizon >= SUSTAINED_WEEKS) {
    findings.push({ id: 'sustained', grade: 'derived', feature: 'workload',
      headline: `${sustained.map(r => r.name).join(', ')} ${sustained.length === 1 ? 'is' : 'are'} planned above ${SUSTAINED_HOURS}h/week for ${horizon} weeks`,
      detail: 'Sustained 50-60 hour weeks are associated with a 10-15% efficiency loss (Thomas & Raynar, JCEM 1997). It is duration that does the damage — a single heavy week carries no evidenced penalty.' });
  }

  const roomy = before.rows.filter(r => r.spare >= 0.5).sort((a, b) => b.spare - a.spare);
  if (roomy.length && (before.totals.overHours > 0 || before.totals.unassignedHours > 0)) {
    findings.push({ id: 'spare', grade: 'reported', feature: 'workload',
      headline: `${roomy.length === 1 ? '1 person has' : `${roomy.length} people have`} room: ${fmtH(before.totals.spareHours)}/week in total`,
      detail: roomy.map(r => `${r.name} (${fmtH(r.spare)})`).join(', ') + '. This is capacity already being paid for.' });
  }

  if (before.totals.unassignedHours > 0) {
    findings.push({ id: 'unassigned', grade: 'reported', feature: 'tasks',
      headline: `${fmtH(before.totals.unassignedHours)}/week of work has no owner`,
      detail: before.unassigned.map(w => `${w.title} (${fmtH(w.hours)}${w.role ? `, needs ${w.role}` : ''})`).join(', ') + '.' });
  }

  if (before.totals.weeklyCost > 0) {
    findings.push({ id: 'cost', grade: 'derived', feature: 'rates',
      headline: `The team costs ${money(input, before.totals.weeklyCost)} a week at this allocation`,
      detail: before.totals.missingRates.length
        ? `Excludes ${before.totals.missingRates.join(', ')} — no cost rate entered, so their hours cannot be costed.`
        : 'Allocated hours multiplied by each person\'s cost rate.' });
  }

  const budgetBefore = budgetView(input, before.totals.weeklyCost);
  const budgetAfter = budgetView(input, after.totals.weeklyCost);
  if (budgetBefore) {
    findings.push({ id: 'budget', grade: 'derived', feature: 'budget',
      headline: budgetBefore.over > 0
        ? `Forecast is ${money(input, budgetBefore.forecast)} against a budget of ${money(input, budgetBefore.amount)} — over by ${money(input, budgetBefore.over)}`
        : `Forecast is ${money(input, budgetBefore.forecast)} against a budget of ${money(input, budgetBefore.amount)} — ${money(input, -budgetBefore.over)} of headroom`,
      detail: `${money(input, budgetBefore.spent)} spent so far, plus ${money(input, before.totals.weeklyCost)} a week for ${budgetBefore.weeks} more weeks.` });
  }

  const bill = billableNote(input, before);
  if (bill) findings.push(bill);

  const moved = r1(steps.filter(s => s.kind === 'move').reduce((a, s) => a + num(s.hours), 0));
  const residual = {
    absorbable,
    overHours: after.totals.overHours,
    unassignedHours: after.totals.unassignedHours,
    people: after.rows.filter(r => r.over > 0).map(r => ({ name: r.name, role: r.role, over: r.over })),
    work: after.unassigned.map(w => ({ title: w.title, role: w.role || '', hours: r1(num(w.hours)) })),
  };

  return {
    before, after, applied, findings, moved, residual,
    budget: budgetBefore ? { before: budgetBefore, after: budgetAfter } : null,
    headline: headline(input, before, residual, steps, budgetAfter),
  };
}

function headline(input, before, residual, steps, budgetAfter) {
  const problem = r1(before.totals.overHours + before.totals.unassignedHours);
  const left = r1(residual.overHours + residual.unassignedHours);
  let line;
  if (problem === 0) line = 'The load fits the team\'s capacity — nothing needs to move.';
  else if (left === 0) line = `The plan resolves all ${fmtH(problem)}/week of overload and unowned work in ${steps.length} step${steps.length === 1 ? '' : 's'}.`;
  else if (residual.absorbable) line = `The plan resolves ${fmtH(r1(Math.max(0, problem - left)))} of ${fmtH(problem)}/week. ${fmtH(left)} is still unresolved, and the team has room to absorb more of it.`;
  else if (left < problem) line = `The plan resolves ${fmtH(r1(problem - left))} of ${fmtH(problem)}/week. The remaining ${fmtH(left)} has no home on this team — that is a scope, date or headcount decision.`;
  else line = `${fmtH(problem)}/week of overload and unowned work, and nobody with room to absorb it. That is a scope, date or headcount decision.`;
  if (budgetAfter && budgetAfter.over > 0) {
    line += ` The forecast still exceeds budget by ${money(input, budgetAfter.over)}; moving work between people does not close that.`;
  }
  return line;
}

/* --- validate --------------------------------------------------------------- */

function validate(input, steps = []) {
  const a = assess(input, steps);
  const byId = index(a.applied.people);
  const cal = weekHours(input.org);
  const horizon = num(input.org.horizonWeeks) || 0;
  const out = [];

  out.push({
    rule: 'Nobody is above capacity after the plan',
    state: a.residual.people.length ? 'fail' : 'pass',
    detail: a.residual.people.length
      ? 'Demand still exceeds availability for:'
      : 'Every person\'s planned hours fit inside their weekly capacity.',
    violations: a.residual.people.map(p => `${p.name}: ${fmtH(p.over)}/week over`),
    basis: 'Resource-limited scheduling (APM): when demand exceeds availability, the work is levelled or the date moves.',
  });

  out.push({
    rule: 'All work has an owner',
    state: a.residual.work.length ? 'fail' : 'pass',
    detail: a.residual.work.length ? 'Still unowned:' : 'Every work item is assigned to a named person.',
    violations: a.residual.work.map(w => `${w.title}: ${fmtH(w.hours)}/week${w.role ? ` (${w.role})` : ''}`),
    basis: 'Unowned work is invisible to every capacity report until someone is assigned.',
  });

  const sustained = a.after.rows.filter(r => r.allocated > SUSTAINED_HOURS);
  const sustainedHit = sustained.length && horizon >= SUSTAINED_WEEKS;
  out.push({
    rule: 'No sustained overload',
    state: sustainedHit ? 'fail' : 'pass',
    detail: sustainedHit
      ? `Planned above ${SUSTAINED_HOURS}h/week for ${horizon} weeks:`
      : `Nobody is planned above ${SUSTAINED_HOURS}h/week for ${SUSTAINED_WEEKS} or more weeks.`,
    violations: sustainedHit ? sustained.map(r => `${r.name}: ${fmtH(r.allocated)}/week`) : [],
    basis: 'Thomas & Raynar, JCEM 1997: 10-15% efficiency loss at sustained 50-60 hour weeks.',
  });

  const aboveCal = a.applied.people.filter(p => num(p.capacity) > cal.hours + 0.01);
  out.push({
    rule: 'Capacity fits the working calendar',
    state: aboveCal.length ? 'warn' : 'pass',
    detail: aboveCal.length
      ? `The working week is ${fmtH(cal.hours)}. These capacities assume planned overtime:`
      : `Every capacity sits within the ${fmtH(cal.hours)} working week.`,
    violations: aboveCal.map(p => `${p.name}: ${fmtH(num(p.capacity))}/week`),
    basis: 'Availability comes from the resource calendar, never a nominal week (PMI, AACE).',
  });

  const noRate = a.after.totals.missingRates;
  out.push({
    rule: 'Everyone doing work has a cost rate',
    state: noRate.length ? 'warn' : 'pass',
    detail: noRate.length
      ? 'Cost and forecast figures exclude these people:'
      : 'Every allocated hour can be costed.',
    violations: noRate,
    basis: 'A missing rate is reported as missing, never treated as zero.',
  });

  const crossRole = [];
  const baseById = index(input.people);
  for (const s of steps.filter(x => x.kind === 'move')) {
    const item = input.work.find(w => w.id === s.workId);
    const to = byId.get(s.to);
    if (!item || !to) continue;
    const need = roleNeeded(item, baseById);
    if (need && to.role && need !== to.role) crossRole.push(`${item.title}: ${need} work going to ${to.name} (${to.role})`);
  }
  out.push({
    rule: 'Moves stay within a role',
    state: crossRole.length ? 'warn' : 'pass',
    detail: crossRole.length ? 'Confirm these people can actually do this work:' : 'Every move goes to someone in the same role.',
    violations: crossRole,
    basis: 'Hours are interchangeable on a spreadsheet; skills are not.',
  });

  if (a.budget) {
    const over = a.budget.after.over;
    out.push({
      rule: 'Forecast is within budget',
      state: over > 0 ? 'fail' : 'pass',
      detail: over > 0
        ? `Forecast ${money(input, a.budget.after.forecast)} exceeds the ${money(input, a.budget.after.amount)} budget by ${money(input, over)}. No contingency percentage is suggested: no standards body prescribes one, and AACE requires it to come from risk analysis.`
        : `Forecast ${money(input, a.budget.after.forecast)} is within the ${money(input, a.budget.after.amount)} budget.`,
      violations: [],
      basis: 'Spent to date plus weekly cost over the remaining weeks.',
    });
  }

  if (a.applied.issues.length) {
    out.push({
      rule: 'Every plan step can be applied',
      state: 'warn',
      detail: 'These steps were skipped:',
      violations: a.applied.issues.map(i => {
        const n = steps.findIndex(s => s.id === i.stepId) + 1;
        return `Step ${n}: ${i.msg}`;
      }),
      basis: 'Edited plans are applied in order; a step that no longer makes sense is skipped, not guessed at.',
    });
  }

  const instrument = B.WORKING_TIME_INSTRUMENTS[input.org.jurisdiction];
  if (instrument && (sustainedHit || aboveCal.length)) {
    out.push({
      rule: 'Check local working-time rules',
      state: 'warn',
      detail: `This plan involves hours above the standard week. The governing instrument here is the ${instrument}. This tool does not assess compliance — confirm with whoever owns employment compliance.`,
      violations: [],
      basis: 'Working-time rules differ by jurisdiction.',
    });
  }

  return out;
}

/* --- Zoho Projects: what gets set up ---------------------------------------- */

const BILLING_METHOD = { time_and_materials: 'staff_hours', fixed_fee: 'fixed_cost' };

function hhmm(hours) {
  const m = Math.round(num(hours) * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** The payload a loader would send. Nothing on the page sends it — it is the spec. */
function buildZohoPayload(input, steps = []) {
  const a = assess(input, steps);
  const byId = index(a.applied.people);
  const cal = weekHours(input.org);
  const projects = new Map();
  for (const w of a.applied.work) {
    const key = w.project || 'General';
    if (!projects.has(key)) projects.set(key, []);
    const owner = byId.get(w.owner);
    projects.get(key).push({
      name: w.title,
      owner: owner ? owner.name : null,
      work_hours_per_week: hhmm(w.hours),
      billing_status: w.billable && !isInternal(input) ? 'Billable' : 'Non-Billable',
    });
  }

  return {
    endpoint_base: 'https://projectsapi.zoho.com/api/v3',
    portal_id: '{{PORTAL_ID}}',
    portal_settings: {
      business_days: cal.days.map(d => C.DAY_NAMES[d]),
      business_hours_per_day: cal.perDay,
    },
    users: a.applied.people.map(p => ({
      name: p.name, role: p.role, to_be_hired: !!p.isHire || undefined,
      weekly_capacity_hours: num(p.capacity),
      budget: { cost_per_hour: num(p.costRate) || null,
        rate_per_hour: isInternal(input) ? null : num(p.billRate) || null },
    })),
    projects: [...projects.entries()].map(([name, tasks]) => ({
      name,
      billing_method: BILLING_METHOD[input.org.billingModel] || null,
      tasks,
    })),
    budget: a.budget ? {
      planned_cost: { amount: a.budget.after.amount, currency: input.org.currency || '' },
      spent_to_date: a.budget.after.spent,
      note: 'Set on the project being tracked; Zoho then reports actual and forecasted cost against it.',
    } : null,
    verify_with: [{ call: 'GET /reports/workload', purpose: 'Confirm Zoho\'s own under / optimal / over verdict matches this plan once time is being logged.' }],
  };
}

/** The same thing as a sequence a person can follow in the product. */
function buildSetupSteps(input, steps = []) {
  const p = buildZohoPayload(input, steps);
  const F = C.ZOHO_FEATURES;
  const taskCount = p.projects.reduce((a, x) => a + x.tasks.length, 0);
  const rated = p.users.filter(u => u.budget.cost_per_hour).length;
  const out = [
    { feature: 'calendar', title: `Set the working week to ${p.portal_settings.business_days.length} days, ${p.portal_settings.business_hours_per_day}h a day`,
      detail: `${p.portal_settings.business_days.join(', ')}. Every capacity figure in Zoho is measured against this.` },
    { feature: 'rates', title: `Add ${p.users.length} people and their rates`,
      detail: `${rated} of ${p.users.length} have a cost rate. This is the field that turns logged hours into money.` },
    { feature: 'tasks', title: `Create ${p.projects.length} project${p.projects.length === 1 ? '' : 's'} and ${taskCount} tasks with owners`,
      detail: 'Owners and weekly hours exactly as in the plan above — the rebalancing is already applied.' },
  ];
  if (p.budget) out.push({ feature: 'budget', title: `Set the project budget to ${money(input, p.budget.planned_cost.amount)}`,
    detail: 'Zoho then tracks actual and forecasted cost against it, so this forecast stops being a spreadsheet exercise.' });
  out.push({ feature: 'timesheets', title: 'Have the team log time against those tasks',
    detail: 'Reported hours become measured hours. Four weeks of logs is the point at which utilisation stops being noise.' });
  out.push({ feature: 'workload', title: 'Open the Workload report',
    detail: 'Zoho labels each person under, optimal or over against the real calendar. That verdict replaces this estimate.' });
  return out.map(s => ({ ...s, featureName: F[s.feature].name, tier: F[s.feature].tier, api: F[s.feature].api }));
}

/** Findings grouped by the Zoho Projects feature that would show them for real. */
function buildFeatureMap(input, steps = []) {
  const out = new Map();
  for (const f of assess(input, steps).findings) {
    const z = C.ZOHO_FEATURES[f.feature];
    if (!z) continue;
    if (!out.has(f.feature)) out.set(f.feature, { key: f.feature, ...z, covers: [] });
    out.get(f.feature).covers.push(f.headline);
  }
  return [...out.values()];
}

/** A hand-off for the installed skill: carry the plan out through the user's own MCP. */
function buildAgentPrompt(input, steps = []) {
  const lines = steps.map((s, i) => `${i + 1}. ${describeStep(s, input)}`);
  return [
    'Use the cost-capacity-optimization skill (with the zoho-projects-api layer) on my Zoho Projects portal.',
    '',
    'I built the capacity plan below in the PM Skills planner, from self-reported figures.',
    '',
    'First check what my portal already holds. If you cannot read it, stop and help me connect it.',
    '- If these people and this work are already there: Read the real Workload report and the project',
    '  budget, tell me where the measured picture differs from what I reported, then propose the',
    '  changes below one at a time.',
    '- If the portal is new or empty: set the plan up as projects and tasks with their owners and',
    '  weekly hours, using the setup data below.',
    '',
    'Names here may be generic (for example "Consultant #2"). Ask me which real person or project each',
    'one is before assigning anything, and wait for my yes before each write.',
    '',
    'Plan:',
    ...(lines.length ? lines : ['(no changes — the load already fits capacity)']),
    '',
    'Never change a cost or billing rate, and never add or invite people — tell me what to enter myself.',
    'Setup data follows as JSON.',
    '',
    JSON.stringify(buildZohoPayload(input, steps), null, 2),
  ].join('\n');
}

/* --- refine by plain-language command --------------------------------------- */

const REFINE_EXAMPLES = [
  'move API integration to Arjun', 'move 6h of Platform build to Rhea', 'don\'t touch Tara',
  'keep Code reviews', 'same role only', 'descope Pitch work by 4h', 'hire a Developer',
  'remove step 2', 'reset plan',
];

function findPerson(input, frag) {
  const f = frag.trim().toLowerCase();
  return input.people.find(p => (p.name || '').toLowerCase() === f) ||
         input.people.find(p => (p.name || '').toLowerCase().includes(f));
}
function findWork(input, frag) {
  const f = frag.trim().toLowerCase().replace(/^["']|["']$/g, '');
  return input.work.find(w => (w.title || '').toLowerCase() === f) ||
         input.work.find(w => (w.title || '').toLowerCase().includes(f));
}

/**
 * Deterministic command parser — a fixed grammar, not a language model. It
 * says so when it does not understand, rather than pretending to.
 * Returns { input, steps, opts, summary, understood }.
 */
function refine(text, input, steps, opts = {}) {
  const t = text.trim();
  const low = t.toLowerCase();
  const next = { input: clone(input), steps: clone(steps), opts: clone(opts), understood: true, summary: '' };
  const repropose = why => {
    next.steps = proposePlan(next.input, next.opts);
    next.summary = `${why} Plan regenerated (${next.steps.length} step${next.steps.length === 1 ? '' : 's'}); manual edits were replaced.`;
    return next;
  };
  let m;

  if (/^(reset|regenerate|start over)/.test(low)) {
    next.opts = {};
    next.input.work.forEach(w => { delete w.locked; });
    return repropose('Constraints cleared.');
  }

  if ((m = low.match(/^(?:remove|delete|drop) step (\d+)/))) {
    const i = Number(m[1]) - 1;
    if (!next.steps[i]) return fail(next, `There is no step ${m[1]}.`);
    const gone = describeStep(next.steps[i], input);
    next.steps.splice(i, 1);
    next.summary = `Removed step ${m[1]}: ${gone}.`;
    return next;
  }

  if (/same role only|no cross[- ]?role/.test(low)) {
    next.opts.allowCrossRole = false;
    return repropose('Moves now stay within a role.');
  }

  if ((m = t.match(/^(?:don'?t|do not|never) touch (.+)$/i) || t.match(/^(?:exclude|leave) (.+?)(?: alone)?$/i))) {
    const p = findPerson(input, m[1]);
    if (!p) return fail(next, `Nobody on the team matches "${m[1]}".`);
    next.opts.exclude = [...new Set([...(next.opts.exclude || []), p.id])];
    return repropose(`${p.name} will neither give nor receive work.`);
  }

  if ((m = t.match(/^(?:lock|keep|don'?t move|do not move) (.+?)(?: with .+)?$/i))) {
    const w = findWork(input, m[1]);
    if (!w) return fail(next, `No work item matches "${m[1]}".`);
    next.input.work.find(x => x.id === w.id).locked = true;
    return repropose(`"${w.title}" stays where it is.`);
  }

  if ((m = t.match(/^move (\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?(?: of)? (.+?) to (.+)$/i))) {
    return addMove(next, input, m[2], m[3], Number(m[1]));
  }
  if ((m = t.match(/^(?:move|assign|give) (.+?) to (.+)$/i))) {
    return addMove(next, input, m[1], m[2], null);
  }

  if ((m = t.match(/^(?:descope|cut|reduce|trim) (.+?) by (\d+(?:\.\d+)?)\s*(%|h(?:ours?|rs?)?)$/i))) {
    const w = findWork(input, m[1]);
    if (!w) return fail(next, `No work item matches "${m[1]}".`);
    const h = m[3] === '%' ? r1(num(w.hours) * Number(m[2]) / 100) : Number(m[2]);
    next.steps.push({ id: `m${next.steps.length + 1}-${w.id}`, kind: 'descope', workId: w.id, hours: h });
    next.summary = `Added: descope "${w.title}" by ${fmtH(h)}/week.`;
    return next;
  }
  if ((m = t.match(/^(?:descope|cut|drop) (.+)$/i))) {
    const w = findWork(input, m[1]);
    if (!w) return fail(next, `No work item matches "${m[1]}".`);
    next.steps.push({ id: `m${next.steps.length + 1}-${w.id}`, kind: 'descope', workId: w.id, hours: num(w.hours) });
    next.summary = `Added: descope "${w.title}" entirely (${fmtH(w.hours)}/week).`;
    return next;
  }

  if ((m = t.match(/^hire (?:an? )?(.+?)(?: (?:at|for) (\d+)\s*h.*)?$/i))) {
    const role = m[1].trim().replace(/\b\w/g, c => c.toUpperCase());
    next.steps.push({ id: `m${next.steps.length + 1}-hire`, kind: 'hire', role, capacity: m[2] ? Number(m[2]) : 40, costRate: 0 });
    next.summary = `Added: ${withArticle(role)} at ${m[2] || 40}h/week. Assign work to them with a move step.`;
    return next;
  }

  return fail(next, 'Not understood. This box takes fixed commands, not free text.');
}

function addMove(next, input, workFrag, personFrag, hours) {
  const w = findWork(input, workFrag);
  if (!w) return fail(next, `No work item matches "${workFrag}".`);
  const p = findPerson(input, personFrag);
  if (!p) return fail(next, `Nobody on the team matches "${personFrag}".`);
  const h = hours == null ? num(w.hours) : hours;
  next.steps.push({ id: `m${next.steps.length + 1}-${w.id}`, kind: 'move', workId: w.id, to: p.id, hours: h });
  next.summary = `Added: move ${fmtH(h)}/week of "${w.title}" to ${p.name}.`;
  return next;
}

function fail(next, msg) {
  next.understood = false;
  next.summary = `${msg} Try: ${REFINE_EXAMPLES.slice(0, 5).map(e => `"${e}"`).join(', ')}.`;
  return next;
}

/* --- report ---------------------------------------------------------------- */

function renderReport(input, steps = []) {
  const a = assess(input, steps);
  const L = [`# Capacity and cost plan${input.org.name ? ` — ${input.org.name}` : ''}`, '', `**${a.headline}**`, '',
    'Built from self-reported figures. Nothing here is measured.', '', '## Where things stand', ''];
  for (const f of a.findings) L.push(`- *(${f.grade})* **${f.headline}** — ${f.detail}`);

  L.push('', '## The plan', '');
  if (!steps.length) L.push('No changes needed.');
  steps.forEach((s, i) => L.push(`${i + 1}. ${describeStep(s, input)}`));

  L.push('', '## Team load', '', '| Person | Role | Now | After plan | Capacity |', '|---|---|---|---|---|');
  for (const r of a.after.rows) {
    const was = a.before.rows.find(x => x.id === r.id);
    L.push(`| ${r.name} | ${r.role} | ${was ? fmtH(was.allocated) : '—'} | ${fmtH(r.allocated)} | ${fmtH(r.capacity)} |`);
  }

  L.push('', '## Checks', '');
  for (const v of validate(input, steps)) {
    L.push(`- **${v.state.toUpperCase()}** — ${v.rule}. ${v.detail}${v.violations.length ? ' ' + v.violations.join('; ') + '.' : ''}`);
  }

  L.push('', '## Setting this up in Zoho Projects', '');
  buildSetupSteps(input, steps).forEach((s, i) => L.push(`${i + 1}. **${s.title}** (${s.featureName}) — ${s.detail}`));

  L.push('', '## Where each finding lives in Zoho Projects', '');
  for (const f of buildFeatureMap(input, steps)) L.push(`- **${f.name}** (${f.tier}) — ${f.does}`);
  return L.join('\n');
}

module.exports = {
  computeLoad, proposePlan, applyPlan, assess, validate, describeStep, refine,
  buildZohoPayload, buildSetupSteps, buildFeatureMap, buildAgentPrompt, renderReport, weekHours,
  withLabels, money, currencySymbol,
  REFINE_EXAMPLES, SUSTAINED_HOURS, SUSTAINED_WEEKS,
};
