'use strict';
/* Smoke test for the planner. Run: node engine/planner.smoke.js */

const P = require('./planner');
const C = require('../knowledge/catalog');

let failures = 0;
function check(label, cond, extra) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined && !ok ? `\n      ${extra}` : ''}`);
}

function inputFor(key, orgOverrides = {}) {
  const s = JSON.parse(JSON.stringify(C.SCENARIOS.find(x => x.key === key)));
  return {
    org: { name: '', weekPattern: 'mon_fri', hoursPerDay: 8, currency: '$', jurisdiction: '',
      horizonWeeks: s.horizonWeeks || 12, ...s.org, ...orgOverrides },
    people: s.people, work: s.work, budget: s.budget,
  };
}
const stepText = (input, steps) => steps.map(s => P.describeStep(s, input));

/* ------------------------------------------------------------------ */
console.log('\n--- scenario: overloaded team ---');
{
  const input = inputFor('overloaded');
  const steps = P.proposePlan(input);
  const a = P.assess(input, steps);

  check('finds 14h/week of overload before the plan', a.before.totals.overHours === 14, a.before.totals.overHours);
  check('names the specific work an overloaded person carries',
    a.findings.find(f => f.id === 'over.p1').detail.includes('API integration'));
  check('proposes two moves', steps.length === 2, JSON.stringify(stepText(input, steps)));
  check('moves the closest-fitting whole item to a same-role colleague',
    steps[0].workId === 'w3' && steps[0].to === 'p3' && steps[0].hours === 14, JSON.stringify(steps[0]));
  check('splits off only the hours needed when no whole item fits',
    steps[1].workId === 'w7' && steps[1].hours === 2, JSON.stringify(steps[1]));
  check('plan clears the overload', a.after.totals.overHours === 0, a.after.totals.overHours);
  check('headline says the plan resolves it', a.headline.includes('resolves all 14h'), a.headline);

  const v = P.validate(input, steps);
  check('capacity rule passes after the plan', v[0].state === 'pass');
  check('cross-role move is flagged, not hidden',
    v.find(x => x.rule.includes('within a role')).state === 'warn');

  const blob = JSON.stringify(a.findings) + JSON.stringify(v) + a.headline;
  check('no "under-utilised" band and no 85% anywhere', !/under-?utili[sz]ed|85%/i.test(blob));
  check('never says to increase utilisation', !/increase utili[sz]ation/i.test(blob));
  check('every finding binds to a Zoho Projects feature',
    a.findings.every(f => C.ZOHO_FEATURES[f.feature]));
  check('grades are reported/derived only — nothing claims to be measured',
    a.findings.every(f => f.grade === 'reported' || f.grade === 'derived'));
}

/* ------------------------------------------------------------------ */
console.log('\n--- editing the plan ---');
{
  const input = inputFor('overloaded');
  const steps = P.proposePlan(input);

  const sameRole = P.refine('same role only', input, steps, {});
  check('"same role only" leaves the QA overload unresolved',
    P.assess(sameRole.input, sameRole.steps).residual.overHours === 2);
  check('...and validation then fails the capacity rule',
    P.validate(sameRole.input, sameRole.steps)[0].state === 'fail');

  const noRhea = P.refine("don't touch Rhea", input, steps, {});
  check('"don\'t touch Rhea" routes the work elsewhere',
    noRhea.understood && noRhea.steps.every(s => s.to !== 'p3'), JSON.stringify(noRhea.steps));

  const keep = P.refine('keep API integration', input, steps, {});
  check('"keep X" locks the item and moves something else instead',
    keep.steps.every(s => s.workId !== 'w3') && P.assess(keep.input, keep.steps).after.totals.overHours === 0,
    JSON.stringify(stepText(keep.input, keep.steps)));

  const added = P.refine('move 6h of Platform build to Arjun', input, steps, {});
  check('"move 6h of X to Y" appends a partial move',
    added.steps.length === 3 && added.steps[2].hours === 6 && added.steps[2].to === 'p2');

  const removed = P.refine('remove step 1', input, steps, {});
  check('"remove step 1" removes it', removed.steps.length === 1 && removed.steps[0].workId === 'w7');

  const junk = P.refine('make everything better please', input, steps, {});
  check('unrecognised text is refused honestly, with examples',
    junk.understood === false && junk.summary.includes('Try:') && junk.steps.length === steps.length);

  const cutShort = P.assess(input, [steps[1]]);
  check('removing a step is reported as "room remains", not "no capacity"',
    cutShort.residual.absorbable === true && cutShort.headline.includes('has room to absorb') &&
    !cutShort.headline.includes('headcount'), cutShort.headline);
  check('a genuine gap is still called a scope, date or headcount decision',
    P.assess(sameRole.input, sameRole.steps, sameRole.opts).residual.absorbable === false);

  const reordered = [steps[1], steps[0]];
  check('reordered plan still applies', P.assess(input, reordered).after.totals.overHours === 0);

  const broken = [{ id: 'x1', kind: 'move', workId: 'w3', to: 'nobody', hours: 14 }, ...steps];
  const res = P.applyPlan(input, broken);
  check('a nonsense step is skipped and reported, not thrown', res.issues.length === 1 && res.issues[0].stepId === 'x1');
  check('...and shows up as a validation warning',
    P.validate(input, broken).some(x => x.rule.includes('can be applied') && x.state === 'warn'));

  const split = P.applyPlan(input, steps).work.find(w => w.splitOf === 'w7');
  check('a partial move splits the work item', split && split.hours === 2 && split.owner === 'p2');
}

/* ------------------------------------------------------------------ */
console.log('\n--- scenario: burning budget (fixed fee) ---');
{
  const input = inputFor('budget');
  const steps = P.proposePlan(input);
  const a = P.assess(input, steps);

  check('weekly cost is hours x cost rate', a.before.totals.weeklyCost === 9150, a.before.totals.weeklyCost);
  check('forecast = spent + weekly cost x remaining weeks', a.budget.before.forecast === 151200, a.budget.before.forecast);
  check('overrun computed', a.budget.before.over === 31200);
  check('headline admits rebalancing does not fix the budget', a.headline.includes('does not close that'), a.headline);
  check('fixed fee: billable ratio called not the measure',
    a.findings.find(f => f.id === 'billable').headline.includes('not the measure'));

  const v = P.validate(input, steps);
  const budgetRule = v.find(x => x.rule.includes('within budget'));
  check('budget rule fails', budgetRule.state === 'fail');
  check('no contingency percentage is suggested', !/\d+\s*% contingency/i.test(JSON.stringify(v)));

  const withCut = [...steps, { id: 'd1', kind: 'descope', workId: 'w3', hours: 10 }];
  check('a descope step lowers the forecast',
    P.assess(input, withCut).budget.after.forecast === 151200 - 10 * 60 * 8,
    P.assess(input, withCut).budget.after.forecast);
}

/* ------------------------------------------------------------------ */
console.log('\n--- scenario: incoming work (in-house team) ---');
{
  const input = inputFor('incoming');
  const steps = P.proposePlan(input);
  const a = P.assess(input, steps);

  check('50h/week arrives unowned', a.before.totals.unassignedHours === 50);
  check('plan places 38h and leaves an honest 12h gap', a.residual.unassignedHours === 12, a.residual.unassignedHours);
  check('the gap is Engineer work', a.residual.work[0].role === 'Engineer');
  check('engineering work is never quietly handed to another role',
    steps.filter(s => s.workId === 'w6').every(s => ['p1', 'p2', 'p3'].includes(s.to)));
  check('headline calls it a scope, date or headcount decision', a.headline.includes('scope, date or headcount'));
  check('billable ratio dismissed for an in-house team',
    a.findings.find(f => f.id === 'billable').headline.includes('not a useful measure'));

  const hired = [...steps,
    { id: 'h1', kind: 'hire', role: 'Engineer', capacity: 40, costRate: 60 },
    { id: 'h2', kind: 'move', workId: 'w6', to: 'hire-h1', hours: 12 }];
  check('adding a hire and assigning the gap resolves it',
    P.assess(input, hired).residual.unassignedHours === 0);
  check('the hire appears in the Zoho payload flagged as to be hired',
    P.buildZohoPayload(input, hired).users.some(u => u.to_be_hired));
}

/* ------------------------------------------------------------------ */
console.log('\n--- calendar, payload, hand-off ---');
{
  check('UAE week with half-day Friday is 36h at 8h/day',
    P.weekHours({ weekPattern: 'mon_fri_half', hoursPerDay: 8 }).hours === 36);
  check('custom four-day week is 32h',
    P.weekHours({ weekPattern: 'custom', workDays: [1, 2, 3, 4], hoursPerDay: 8 }).hours === 32);

  const short = inputFor('overloaded', { weekPattern: 'custom', workDays: [1, 2, 3, 4] });
  check('capacity above the working calendar is flagged',
    P.validate(short, P.proposePlan(short)).find(x => x.rule.includes('calendar')).state === 'warn');

  const heavy = inputFor('overloaded', { jurisdiction: 'uae', weekPattern: 'mon_fri_half' });
  const hv = P.validate(heavy, []);
  check('sustained overload fails when nothing is done', hv.find(x => x.rule === 'No sustained overload').state === 'fail');
  check('names the instrument without stating the law',
    hv.some(x => x.detail.includes('Federal Decree-Law No. 33 of 2021')) && !/is required by law/.test(JSON.stringify(hv)));

  const input = inputFor('overloaded');
  const steps = P.proposePlan(input);
  const payload = P.buildZohoPayload(input, steps);
  check('payload carries the rebalanced owner', payload.projects.find(p => p.name === 'Client B')
    .tasks.find(t => t.name === 'API integration').owner === 'Rhea Shah');
  check('payload maps time & materials to a Zoho billing method', payload.projects[0].billing_method === 'staff_hours');
  check('payload sets the business days', payload.portal_settings.business_days.join() === 'Monday,Tuesday,Wednesday,Thursday,Friday');
  check('payload never invents a portal id', payload.portal_id === '{{PORTAL_ID}}');

  const setup = P.buildSetupSteps(input, steps);
  check('setup sequence ends at the Workload report', setup[setup.length - 1].feature === 'workload');
  check('every setup step names its Zoho feature and plan tier', setup.every(s => s.featureName && s.tier));

  const prompt = P.buildAgentPrompt(input, steps);
  check('agent hand-off demands confirm-first writes', prompt.includes('wait for my yes'));
  check('agent hand-off forbids rate changes', prompt.includes('Never change a cost or billing rate'));
  check('agent hand-off asks for measured data first', prompt.includes('Read the real Workload report'));
  check('agent hand-off covers a new or empty portal', /new or empty/.test(prompt) && /set the plan up/.test(prompt));
  check('agent hand-off tells the agent to resolve generic names', prompt.includes('Consultant #2') && /Ask me which real person/.test(prompt));
  check('agent hand-off forbids inviting people', prompt.includes('never add or invite people'));

  const md = P.renderReport(input, steps);
  check('report renders with plan and setup sections',
    md.includes('## The plan') && md.includes('## Setting this up in Zoho Projects'));
  check('report states the data is self-reported', md.includes('self-reported'));
}

/* ------------------------------------------------------------------ */
console.log('\n--- one currency everywhere ---');
{
  const input = inputFor('budget', { currency: 'AUD' });
  const steps = P.proposePlan(input);
  const everything = [
    JSON.stringify(P.assess(input, steps).findings), P.assess(input, steps).headline,
    JSON.stringify(P.validate(input, steps)), JSON.stringify(P.buildSetupSteps(input, steps)),
    P.renderReport(input, steps),
  ].join('\n');
  const figures = everything.match(/(?:A\$|C\$|S\$|[$€£₹¥]|AED |SAR )\d[\d,]*/g) || [];
  check('money is printed', figures.length > 5, figures.length);
  check('every figure carries the chosen currency (A$)', figures.every(f => f.startsWith('A$')),
    [...new Set(figures.filter(f => !f.startsWith('A$')))].join(' '));
  check('P.money is the same formatter the findings use', P.money(input, 1455000) === 'A$1,455,000');
  check('payload carries the ISO code, not a symbol', P.buildZohoPayload(input, steps).budget.planned_cost.currency === 'AUD');
  check('an unknown currency is used as a literal prefix', P.money({ org: { currency: 'kr ' } }, 1200) === 'kr 1,200');
}

/* ------------------------------------------------------------------ */
console.log('\n--- names are optional ---');
{
  const raw = inputFor('budget');
  raw.people[1].name = '';                      // Karan -> first "Consultant"
  raw.people.push({ id: 'p6', name: '', role: 'Consultant', capacity: 40, costRate: 0, billRate: 0 });
  raw.people.push({ id: 'p7', name: '  ', role: '', capacity: 40, costRate: 0, billRate: 0 });
  raw.work[0].project = '';
  raw.work.push({ id: 'w10', title: '', project: '', owner: 'p6', hours: 4, billable: true });

  const named = P.withLabels(raw);
  const nameOf = id => named.people.find(p => p.id === id).name;
  check('a typed name is kept', nameOf('p1') === 'Nisha Rao');
  check('a blank name becomes role + ordinal', nameOf('p2') === 'Consultant #1', nameOf('p2'));
  check('the ordinal counts everyone in that role', nameOf('p6') === 'Consultant #3', nameOf('p6'));
  check('no role falls back to Person #n', nameOf('p7') === 'Person #1', nameOf('p7'));
  check('a blank project gets a generic reference', /^Project #\d+$/.test(named.work[0].project), named.work[0].project);
  check('blank projects share one reference', named.work[0].project === named.work.find(w => w.id === 'w10').project);
  check('a typed project is kept', named.work[1].project === 'Transformation programme');
  check('a blank work title is numbered', named.work.find(w => w.id === 'w10').title === 'Work item #10');
  check('labelling twice changes nothing', JSON.stringify(P.withLabels(named)) === JSON.stringify(named));
  check('the input is not mutated', raw.people[1].name === '');

  const anon = P.withLabels({ ...raw, org: { ...raw.org, genericLabels: true } });
  check('generic labels replace every person name',
    anon.people.every(p => /^(Lead Consultant|Consultant|Analyst|Person) #\d+$/.test(p.name)), anon.people.map(p => p.name).join());
  check('generic labels replace every project name', anon.work.every(w => /^Project #\d+$/.test(w.project)));
  check('distinct projects stay distinct', new Set(anon.work.map(w => w.project)).size === new Set(raw.work.map(w => w.project)).size);
  const out = [P.renderReport(anon, P.proposePlan(anon)), JSON.stringify(P.buildZohoPayload(anon, P.proposePlan(anon))),
    P.buildAgentPrompt(anon, P.proposePlan(anon))].join('\n');
  check('no real name or project reaches the report, payload or hand-off',
    !/Nisha|Karan|Priya|Omar|Lina|Transformation/.test(out));
  check('"Unnamed" never appears', !/Unnamed/.test(out + P.renderReport(named, P.proposePlan(named))));
  check('refine understands a generic reference',
    P.refine('move Solution design to Consultant #2', anon, []).understood);
}

/* ------------------------------------------------------------------ */
console.log('\n--- work that is not client-billed ---');
{
  const input = inputFor('budget', { billingModel: 'internal' });
  const steps = P.proposePlan(input);
  const a = P.assess(input, steps);
  check('no budget forecast is produced', a.budget === null && !a.findings.some(f => f.id === 'budget'));
  check('no budget rule is validated', !P.validate(input, steps).some(v => v.rule === 'Forecast is within budget'));
  check('billable ratio is left out, not scored',
    a.findings.find(f => f.id === 'billable').headline.includes('not client-billed'));
  const payload = P.buildZohoPayload(input, steps);
  check('payload has no budget, billing rate or billable task',
    payload.budget === null && payload.users.every(u => u.budget.rate_per_hour === null) &&
    payload.projects.every(p => p.tasks.every(t => t.billing_status === 'Non-Billable')));
  check('weekly cost is still reported', a.before.totals.weeklyCost === 9150);
  check('setup sequence has no budget step', !P.buildSetupSteps(input, steps).some(s => s.feature === 'budget'));
}

/* ------------------------------------------------------------------ */
console.log('\n--- findings mapped to Zoho Projects features ---');
{
  const input = inputFor('budget');
  const steps = P.proposePlan(input);
  const map = P.buildFeatureMap(input, steps);
  const total = map.reduce((n, f) => n + f.covers.length, 0);
  check('each feature is listed once', new Set(map.map(f => f.key)).size === map.length);
  check('every finding is covered by exactly one feature', total === P.assess(input, steps).findings.length, total);
  check('each feature says what it does and which plan has it', map.every(f => f.name && f.does && f.tier));
  check('the budget finding maps to Project Budget', map.find(f => f.key === 'budget').covers[0].includes('budget'));
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
